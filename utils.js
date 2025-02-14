/*
    Copyright (c) 2014 Bastien Clément <g@ledric.me>

    Permission is hereby granted, free of charge, to any person obtaining a
    copy of this software and associated documentation files (the
    "Software"), to deal in the Software without restriction, including
    without limitation the rights to use, copy, modify, merge, publish,
    distribute, sublicense, and/or sell copies of the Software, and to
    permit persons to whom the Software is furnished to do so, subject to
    the following conditions:

    The above copyright notice and this permission notice shall be included
    in all copies or substantial portions of the Software.

    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
    OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
    MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
    IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
    CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
    TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
    SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

// Pad number with spaces until fixed width
export let pad = function(n, length) {
    return ("            ".slice(0, length-(""+n).length)) + n;
};


// Format bytes size string
export let bytes = function(b) {
    var unit = 'B';

    if(b > 1024) { b /= 1024; unit = 'KB'; }
    if(b > 1024) { b /= 1024; unit = 'MB'; }
    if(b > 1024) { b /= 1024; unit = 'GB'; }

    var upper = Math.floor(b);
    var lower = Math.floor((b - upper) * 10);

    return upper + "." + lower + unit;
};
