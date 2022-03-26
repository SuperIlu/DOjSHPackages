/*
QOI - The "Quite OK Image" format for fast, lossless image compression

Dominic Szablewski - https://phoboslab.org

-- LICENSE: The MIT License(MIT)

Copyright(c) 2021 Dominic Szablewski
DOjS Javascript port by Andre Seidelt <superilu@yahoo.com>

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files(the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and / or sell copies
of the Software, and to permit persons to whom the Software is furnished to do
so, subject to the following conditions :
The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

function WriteUint32BE(f, val) {
	f.WriteByte(0xFF & (val >> 24));
	f.WriteByte(0xFF & (val >> 16));
	f.WriteByte(0xFF & (val >> 8));
	f.WriteByte(0xFF & (val));
}

function CopyPx(px) {
	return {
		"v": px.v,
		"rgba": {
			"r": px.rgba.r,
			"g": px.rgba.g,
			"b": px.rgba.b,
			"a": px.rgba.a
		}
	};
}

function SaveQoiImage(bm, fn) {
	if ((typeof bm.width != "number") || (typeof bm.height != "number") || (typeof bm.GetPixel != "function")) {
		throw new Error("[QOIENC] Not a Bitmap");
	}

	// open file and write magic
	var f = new File(fn, FILE.WRITE);
	f.WriteByte(CharCode('q'));
	f.WriteByte(CharCode('o'));
	f.WriteByte(CharCode('i'));
	f.WriteByte(CharCode('f'));

	// write image size
	WriteUint32BE(f, bm.width);
	WriteUint32BE(f, bm.height);

	// image channels are 4 (RGBA)
	var QIO_NUM_CHANNEL = 4;
	f.WriteByte(QIO_NUM_CHANNEL);

	// image colorspace is linear
	var QOI_LINEAR = 1;
	f.WriteByte(QOI_LINEAR);

	// encode image
	var QOI_OP_INDEX = 0x00 /* 00xxxxxx */
	var QOI_OP_DIFF = 0x40 /* 01xxxxxx */
	var QOI_OP_LUMA = 0x80 /* 10xxxxxx */
	var QOI_OP_RUN = 0xc0 /* 11xxxxxx */
	var QOI_OP_RGB = 0xfe /* 11111110 */
	var QOI_OP_RGBA = 0xff /* 11111111 */
	var QOI_MASK_2 = 0xc0 /* 11000000 */
	var EMPTY_PX = {
		"v": 0,
		"rgba": {
			"r": 0,
			"g": 0,
			"b": 0,
			"a": 255
		}
	};
	var QOI_COLOR_HASH = function (c) {
		return (c.r * 3 + c.g * 5 + c.b * 7 + c.a * 11);
	}
	var qoi_padding = [0, 0, 0, 0, 0, 0, 0, 1];
	var index = [];
	for (var i = 0; i < 64; i++) {
		index.push(CopyPx(EMPTY_PX));
	}

	var run = 0;
	var px_prev = CopyPx(EMPTY_PX);
	var px = CopyPx(EMPTY_PX);

	var px_len = bm.width * bm.height * QIO_NUM_CHANNEL;
	var px_end = px_len - QIO_NUM_CHANNEL;
	var channels = QIO_NUM_CHANNEL;

	var x = 0;
	var y = 0;
	for (var px_pos = 0; px_pos < px_len; px_pos += channels) {
		px.v = bm.GetPixel(x, y);
		px.rgba.r = GetRed(px.v);
		px.rgba.g = GetGreen(px.v);
		px.rgba.b = GetBlue(px.v);
		px.rgba.a = GetAlpha(px.v);

		if (px.v === px_prev.v) {
			run++;
			if (run === 62 || px_pos === px_end) {
				f.WriteByte(QOI_OP_RUN | (run - 1));
				run = 0;
			}
		} else {
			var index_pos;

			if (run > 0) {
				f.WriteByte(QOI_OP_RUN | (run - 1));
				run = 0;
			}

			index_pos = QOI_COLOR_HASH(px) % 64;

			if (index[index_pos].v === px.v) {
				f.WriteByte(QOI_OP_INDEX | index_pos);
			} else {
				index[index_pos] = CopyPx(px);

				if (px.rgba.a === px_prev.rgba.a) {
					var vr = px.rgba.r - px_prev.rgba.r;
					var vg = px.rgba.g - px_prev.rgba.g;
					var vb = px.rgba.b - px_prev.rgba.b;

					var vg_r = vr - vg;
					var vg_b = vb - vg;

					if (
						vr > -3 && vr < 2 &&
						vg > -3 && vg < 2 &&
						vb > -3 && vb < 2
					) {
						f.WriteByte(QOI_OP_DIFF | (vr + 2) << 4 | (vg + 2) << 2 | (vb + 2));
					} else if (
						vg_r > -9 && vg_r < 8 &&
						vg > -33 && vg < 32 &&
						vg_b > -9 && vg_b < 8
					) {
						f.WriteByte(QOI_OP_LUMA | (vg + 32));
						f.WriteByte((vg_r + 8) << 4 | (vg_b + 8));
					} else {
						f.WriteByte(QOI_OP_RGB);
						f.WriteByte(px.rgba.r);
						f.WriteByte(px.rgba.g);
						f.WriteByte(px.rgba.b);
					}
				} else {
					f.WriteByte(QOI_OP_RGBA);
					f.WriteByte(px.rgba.r);
					f.WriteByte(px.rgba.g);
					f.WriteByte(px.rgba.b);
					f.WriteByte(px.rgba.a);
				}
			}
		}
		px_prev = CopyPx(px);

		x++;
		if (x >= bm.width) {
			y++;
			x = 0;
		}
	}

	for (var i = 0; i < qoi_padding.length; i++) {
		f.WriteByte(qoi_padding[i]);
	}


	// close file
	f.Close();
}

exports.SaveQoiImage = SaveQoiImage;
