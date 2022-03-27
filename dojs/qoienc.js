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

/**
 * encode an integer as unsigned 32bit big endian
 * 
 * @param {IntArray} ia where to store the value
 * @param {*} val the value
 */
function PushUint32BE(ia, val) {
	ia.Push(0xFF & (val >> 24));
	ia.Push(0xFF & (val >> 16));
	ia.Push(0xFF & (val >> 8));
	ia.Push(0xFF & (val));
}

/**
 * create a clone of a pixel object
 * 
 * @param {*} px pixel object to copy
 * 
 * @returns a new pixel object with the same values as px.
 */
function ClonePx(px) {
	return {
		"v": px.v,
		"r": px.r,
		"g": px.g,
		"b": px.b,
		"a": px.a
	};
}

/**
 * copy pixel data from source to destination.
 * 
 * @param {*} d destination object
 * @param {*} s source object
 */
function CopyPx(d, s) {
	d.v = s.v;
	d.r = s.r;
	d.g = s.g;
	d.b = s.b;
	d.a = s.a;
}

/**
 * Encode a Bitmap as QOI image.
 * 
 * @param {Bitmap} bm the Bitmap to encode.
 * 
 * @returns {IntArray} the encoded image data as an IntArray.
 */
function EncodeQoi(bm) {
	if ((typeof bm.width != "number") || (typeof bm.height != "number") || (typeof bm.GetPixel != "function")) {
		throw new Error("[QOIENC] Not a Bitmap");
	}

	// open file and write magic
	var ia = new IntArray();
	ia.Push(CharCode('q'));
	ia.Push(CharCode('o'));
	ia.Push(CharCode('i'));
	ia.Push(CharCode('f'));

	// write image size
	PushUint32BE(ia, bm.width);
	PushUint32BE(ia, bm.height);

	// image channels are 4 (RGBA)
	var QIO_NUM_CHANNEL = 4;
	ia.Push(QIO_NUM_CHANNEL);

	// image colorspace is linear
	var QOI_LINEAR = 1;
	ia.Push(QOI_LINEAR);

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
		"r": 0,
		"g": 0,
		"b": 0,
		"a": 255
	};
	var QOI_COLOR_HASH = function (c) {
		return (c.r * 3 + c.g * 5 + c.b * 7 + c.a * 11);
	}
	var qoi_padding = [0, 0, 0, 0, 0, 0, 0, 1];
	var index = [];
	for (var i = 0; i < 64; i++) {
		index.push(ClonePx(EMPTY_PX));
	}

	var run = 0;
	var px_prev = ClonePx(EMPTY_PX);
	var px = ClonePx(EMPTY_PX);

	var px_len = bm.width * bm.height * QIO_NUM_CHANNEL;
	var px_end = px_len - QIO_NUM_CHANNEL;
	var channels = QIO_NUM_CHANNEL;

	var x = 0;
	var y = 0;
	for (var px_pos = 0; px_pos < px_len; px_pos += channels) {
		px.v = bm.GetPixel(x, y);
		px.r = GetRed(px.v);
		px.g = GetGreen(px.v);
		px.b = GetBlue(px.v);
		px.a = GetAlpha(px.v);

		if (px.v === px_prev.v) {
			run++;
			if (run === 62 || px_pos === px_end) {
				ia.Push(QOI_OP_RUN | (run - 1));
				run = 0;
			}
		} else {
			var index_pos;

			if (run > 0) {
				ia.Push(QOI_OP_RUN | (run - 1));
				run = 0;
			}

			index_pos = QOI_COLOR_HASH(px) % 64;

			if (index[index_pos].v === px.v) {
				ia.Push(QOI_OP_INDEX | index_pos);
			} else {
				CopyPx(index[index_pos], px);

				if (px.a === px_prev.a) {
					var vr = px.r - px_prev.r;
					var vg = px.g - px_prev.g;
					var vb = px.b - px_prev.b;

					var vg_r = vr - vg;
					var vg_b = vb - vg;

					if (
						vr > -3 && vr < 2 &&
						vg > -3 && vg < 2 &&
						vb > -3 && vb < 2
					) {
						ia.Push(QOI_OP_DIFF | (vr + 2) << 4 | (vg + 2) << 2 | (vb + 2));
					} else if (
						vg_r > -9 && vg_r < 8 &&
						vg > -33 && vg < 32 &&
						vg_b > -9 && vg_b < 8
					) {
						ia.Push(QOI_OP_LUMA | (vg + 32));
						ia.Push((vg_r + 8) << 4 | (vg_b + 8));
					} else {
						ia.Push(QOI_OP_RGB);
						ia.Push(px.r);
						ia.Push(px.g);
						ia.Push(px.b);
					}
				} else {
					ia.Push(QOI_OP_RGBA);
					ia.Push(px.r);
					ia.Push(px.g);
					ia.Push(px.b);
					ia.Push(px.a);
				}
			}
		}
		CopyPx(px_prev, px);

		x++;
		if (x >= bm.width) {
			y++;
			x = 0;
		}
	}

	for (var i = 0; i < qoi_padding.length; i++) {
		ia.Push(qoi_padding[i]);
	}

	return ia;
}

/**
 * Save a Bitmap as a QOI image.
 * 
 * @param {Bitmap} bm bitmap to save as QOI image.
 * @param {string} fn the name of the file to create.
 */
function SaveQoiImage(bm, fn) {
	var data = EncodeQoi(bm);

	// open file and write magic
	var f = new File(fn, FILE.WRITE);
	f.WriteInts(data);
	f.Close();
}

// export functions and version
exports.__VERSION__ = 2;
exports.SaveQoiImage = SaveQoiImage;
exports.EncodeQoi = EncodeQoi;
