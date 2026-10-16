// Solves the "checking your browser" cookie test some free hosts put in front of the site/API.
// Tiny AES-128-CBC decrypt (no padding), same as the host's own slowAES script.
(function (root) {
'use strict';
var SB = hex2b('637c777bf26b6fc53001672bfed7ab76ca82c97dfa5947f0add4a2af9ca472c0b7fd9326363ff7cc34a5e5f171d8311504c723c31896059a071280e2eb27b27509832c1a1b6e5aa0523bd6b329e32f8453d100ed20fcb15b6acbbe394a4c58cfd0efaafb434d338545f9027f503c9fa851a3408f929d38f5bcb6da2110fff3d2cd0c13ec5f974417c4a77e3d645d197360814fdc222a908846eeb814de5e0bdbe0323a0a4906245cc2d3ac629195e479e7c8376d8dd54ea96c56f4ea657aae08ba78252e1ca6b4c6e8dd741f4bbd8b8a703eb5664803f60e613557b986c11d9ee1f8981169d98e949b1e87e9ce5528df8ca1890dbfe6426841992d0fb054bb16'), ISB = [];
for (var i = 0; i < 256; i++) ISB[SB[i]] = i;
function hex2b(h) { var o = []; for (var i = 0; i < h.length; i += 2) o.push(parseInt(h.substr(i, 2), 16)); return o; }
function b2hex(b) { return b.map(function (x) { return (x < 16 ? '0' : '') + x.toString(16); }).join(''); }
function xt(a) { return ((a << 1) ^ ((a & 0x80) ? 0x1b : 0)) & 0xff; }
function mul(a, b) { var r = 0; while (b) { if (b & 1) r ^= a; a = xt(a); b >>= 1; } return r; }
function expand(key) {
  var w = key.slice(), rc = 1;
  for (var i = 16; i < 176; i += 4) {
    var t = w.slice(i - 4, i);
    if (i % 16 === 0) { t = [SB[t[1]] ^ rc, SB[t[2]], SB[t[3]], SB[t[0]]]; rc = xt(rc); }
    for (var j = 0; j < 4; j++) w[i + j] = w[i - 16 + j] ^ t[j];
  }
  return w;
}
function decBlock(blk, w) {
  var s = blk.slice(), r, i;
  function ark(n) { for (i = 0; i < 16; i++) s[i] ^= w[n * 16 + i]; }
  function isr() { // inverse shift rows (column-major state)
    var t = s.slice();
    for (var c = 0; c < 4; c++) for (var rr = 0; rr < 4; rr++) s[((c + rr) % 4) * 4 + rr] = t[c * 4 + rr];
  }
  function isb() { for (i = 0; i < 16; i++) s[i] = ISB[s[i]]; }
  function imc() {
    for (var c = 0; c < 4; c++) {
      var a = s.slice(c * 4, c * 4 + 4);
      s[c * 4]     = mul(a[0], 14) ^ mul(a[1], 11) ^ mul(a[2], 13) ^ mul(a[3], 9);
      s[c * 4 + 1] = mul(a[0], 9) ^ mul(a[1], 14) ^ mul(a[2], 11) ^ mul(a[3], 13);
      s[c * 4 + 2] = mul(a[0], 13) ^ mul(a[1], 9) ^ mul(a[2], 14) ^ mul(a[3], 11);
      s[c * 4 + 3] = mul(a[0], 11) ^ mul(a[1], 13) ^ mul(a[2], 9) ^ mul(a[3], 14);
    }
  }
  ark(10);
  for (r = 9; r >= 1; r--) { isr(); isb(); ark(r); imc(); }
  isr(); isb(); ark(0);
  return s;
}
function cbcDecryptHex(keyHex, ivHex, ctHex) {
  var w = expand(hex2b(keyHex)), prev = hex2b(ivHex), ct = hex2b(ctHex), out = [];
  for (var o = 0; o + 16 <= ct.length; o += 16) {
    var blk = ct.slice(o, o + 16), d = decBlock(blk, w);
    for (var i = 0; i < 16; i++) out.push(d[i] ^ prev[i]);
    prev = blk;
  }
  return b2hex(out);
}
// Returns {name, value} if `html` is the cookie-test page, else null.
function solve(html) {
  if (typeof html !== 'string' || html.indexOf('toNumbers') < 0) return null;
  var m = html.match(/toNumbers\("([0-9a-fA-F]+)"\)/g);
  if (!m || m.length < 3) return null;
  var v = m.slice(0, 3).map(function (x) { return x.match(/"([0-9a-fA-F]+)"/)[1]; });
  var n = html.match(/document\.cookie\s*=\s*"([A-Za-z0-9_]+)="/);
  return { name: n ? n[1] : '__test', value: cbcDecryptHex(v[0], v[1], v[2]) };
}
root.WLChallenge = { solve: solve, cbcDecryptHex: cbcDecryptHex };
})(typeof window !== 'undefined' ? window : globalThis);
