function cubicInterpolateIndex(_data, _len, _index) {
	var fi = Math.floor(_index);
	var pi = _index - Math.floor(_index);
	if (pi == 0)
		return _data[fi];
	if (fi >= _len - 1)
		return _data[_len - 1];
	if (fi <= 0)
		return _data[0];

	var m = _data[fi + 1] - _data[fi];
	var mi = fi ? (_data[fi + 1] - _data[fi - 1]) / 2 : m;
	var mia1 = (fi < _len - 2) ? (_data[fi + 2] - _data[fi]) / 2 : m;
	var pi2 = pi * pi;
	var pi3 = pi2 * pi;

	return _data[fi] * (1.0 - 3.0 * pi2 + 2.0 * pi3) + mi * (pi - 2.0 * pi2 + pi3) + _data[fi + 1] * (3.0 * pi2 - 2.0 * pi3) - mia1 * (pi2 - pi3);
}
function interpolateValue(_l, _s, _v) {
	if (_v <= _l[0])
		return 0;
	if (_v >= _l[_s - 1])
		return _s - 1;

	var i = 0;
    while (i != _l.length && _l[i] < _v) ++i;
    --i;
	if (_l[i] == _v)
		return i;
	return i + (_v - _l[i]) / (_l[i] - _l[i - 1]);
}

function hslToRgb(h, s, l) {
    var r, g, b;

    if(s == 0){
        r = g = b = l; // achromatic
    }else{
        var hue2rgb = function hue2rgb(p, q, t){
            if(t < 0) t += 1;
            if(t > 1) t -= 1;
            if(t < 1/6) return p + (q - p) * 6 * t;
            if(t < 1/2) return q;
            if(t < 2/3) return p + (q - p) * (2/3 - t) * 6;
            return p;
        }

        var q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        var p = 2 * l - q;
        r = hue2rgb(p, q, h + 1/3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1/3);
    }

    return [r, g, b];
}

class Psychoaccoustics {
    constructor (analyser, frequency = 44100, dbOffset = 90) {
        this.bark = this._initBark(analyser.frequencyBinCount, analyser.fftSize / 44100);
        this.phon = this._initPhon(this.bark.centres);
        this.dbOffset = dbOffset;
        this.BARK_BANDS = 26;
    }

    _initBark (bc, ws) {
        const barkBands = [ 100, 200, 300, 400, 510, 630, 770, 920, 1080, 1270, 1480, 1720, 2000, 2320, 2700, 3150, 3700, 4400, 5300, 6400, 7700, 9500, 12000, 15500, 20500, 27000 ];
        var band = (bandCount, windowSeconds, frequency) => {
            var ws = frequency * windowSeconds;
            return ws < 0 ? 0 : ws > bandCount - 1 ? bandCount - 1 : ws;
        };
        var r = new Float32Array(barkBands.length);
        for (var i = 0; i < barkBands.length; ++i)
    		r[i] = Math.round(band(bc, ws, barkBands[i]));
        r.centres = [ 50, 150, 250, 350, 450, 570, 700, 840, 1000, 1170, 1370, 1600, 1850, 2150, 2500, 2900, 3400, 4000, 4800, 5800, 7000, 8500, 10500, 13500, 17500, 22500 ];
        return r;
    }

    _initPhon (_centres) {
        const s_fr = [ 20, 25, 31.5, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000, 12500 ];
        const s_af = [ 0.532, 0.506, 0.480, 0.455, 0.432, 0.409, 0.387, 0.367, 0.349, 0.330, 0.315, 0.301, 0.288, 0.276, 0.267, 0.259, 0.253, 0.250, 0.246, 0.244, 0.243, 0.243, 0.243, 0.242, 0.242, 0.245, 0.254, 0.271, 0.301 ];
        const s_Lu = [ -31.6, -27.2, -23.0, -19.1, -15.9, -13.0, -10.3, -8.1, -6.2, -4.5, -3.1, -2.0, -1.1, -0.4, 0.0, 0.3, 0.5, 0.0, -2.7, -4.1, -1.0, 1.7, 2.5, 1.2, -2.1, -7.1, -11.2, -10.7, -3.1 ];
        const s_Tf = [ 78.5, 68.7, 59.5, 51.1, 44.0, 37.5, 31.5, 26.5, 22.1, 17.9, 14.4, 11.4, 8.6, 6.2, 4.4, 3.0, 2.2, 2.4, 3.5, 1.7, -1.3, -4.2, -6.0, -5.4, -1.5, 6.0, 12.6, 13.9, 12.3 ];
        var Lu = new Float32Array(_centres.length);
        var af = new Float32Array(_centres.length);
        var sc = new Float32Array(_centres.length);
    	for (var i = 0; i < _centres.length; i++) {
    		var b = interpolateValue(s_fr, 29, _centres[i]);
    		Lu[i] = cubicInterpolateIndex(s_Lu, 29, b);
    		af[i] = cubicInterpolateIndex(s_af, 29, b);
            sc[i] = Math.pow(0.4 * Math.pow(10,
                (cubicInterpolateIndex(s_Tf, 29, b) + Lu[i]) / 10 - 9
            ), af[i]);
    	}
        return {Lu, af, sc};
    }

    process(buffer, bands, cumBands) {
        let o = this.dbOffset;
        let bark = this.bark;
        let bs = bark.length;
        let phon = this.phon;
        for (var b = 0; b < bs; ++b) {
            var s = b > 0 ? bark[b - 1] : 0;
            var e = bark[b];
            var db = 0;
            var magtot = 0;
            for (var i = s; i < e && i < buffer.length; ++i) {
                magtot += Math.pow(10, buffer[i] / 10);
            }
            db = Math.max(0, Math.log10(magtot) * 10 + o);
            bands[b] = Math.max(0, Math.log10((Math.pow(10,
                (db - 94 + phon.Lu[b]) / 10 * phon.af[b]
            ) - phon.sc[b]) / 4.47e-3 + 1.15) / 0.025);
            cumBands[b] = bands[b] + (b > 0 ? cumBands[b - 1] : 0);
        }
    }
}

var gl;
function getShader(gl, id) {
  var shaderScript = document.getElementById(id);
  if (!shaderScript) {
    return null;
  }
  var str = "";
  var k = shaderScript.firstChild;
  while (k) {
    if (k.nodeType == 3) {
      str += k.textContent;
    }
    k = k.nextSibling;
  }
  var shader;
  if (shaderScript.type == "x-shader/x-fragment") {
    shader = gl.createShader(gl.FRAGMENT_SHADER);
  } else if (shaderScript.type == "x-shader/x-vertex") {
    shader = gl.createShader(gl.VERTEX_SHADER);
  } else {
    return null;
  }
  gl.shaderSource(shader, str);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    alert(gl.getShaderInfoLog(shader));
    return null;
  }
  return shader;
}
function initGL(canvas) {
  try {
    gl = canvas.getContext("webgl");
    gl.getExtension('OES_texture_float');
  } catch (e) {
  }
  if (!gl) {
    alert("Could not initialise WebGL, sorry :-(");
  }
}

function initAudio() {
  window.AudioContext = window.AudioContext || window.webkitAudioContext;
  var context = new AudioContext();
  // microphone
  /*navigator.getUserMedia({audio: true}, function(stream) {
    initFromMediaSource(context.createMediaStreamSource(stream), context);
  }, console.warn);*/
  // media
  var source = context.createMediaElementSource(document.getElementById('player'));
  initFromMediaSource(source, context).connect(context.destination);
}

var analyser;

function initFromMediaSource(source, context) {
  analyser = context.createAnalyser();
  analyser.fftSize = 1024;
  analyser.maxDecibels = 0;
  analyser.minDecibels = -90;
  analyser.smoothingTimeConstant = 0;
  source.connect(analyser);
  return analyser;
}

/// Constants
const tooClose = 8;

/// Stuff for our viz.
var viz = new Float32Array(512);
var tint = [1, 1, 0];
var loudness = 0;
var consistency = 0;
var lastOffset = 0;

/// Global state.
var psychoaccoustics = null;
var waveHistory = new Float32Array(3072);

/// Track ranges.
var minScore = 1e99;
var maxScore = 1e-99;
var minTotal = 1e99;
var maxTotal = 1e-99;

/// Allocate frame variables once to avoid cost.
var freqDomain;
var bands;
var cumBands;

// Update the audio...
function updateAudio() {
    if (analyser) {
        if (!psychoaccoustics) {
            psychoaccoustics = new Psychoaccoustics(analyser);

            bands = new Float32Array(psychoaccoustics.BARK_BANDS, 0);
            cumBands = new Float32Array(psychoaccoustics.BARK_BANDS, 0);
            freqDomain = new Float32Array(analyser.frequencyBinCount, 0);
        }

        lastOffset -= analyser.fftSize;

        // Queue up time domain into our recent history buffer.
        waveHistory.subarray(0, waveHistory.length - analyser.fftSize).set(waveHistory.subarray(analyser.fftSize, waveHistory.length));
        var incoming = waveHistory.subarray(waveHistory.length - analyser.fftSize, waveHistory.length);
        analyser.getFloatTimeDomainData(incoming);
        incoming.set(incoming.map(x => Math.min(1, Math.abs(x) * 4)));

        analyser.getFloatFrequencyData(freqDomain);
    	psychoaccoustics.process(freqDomain, bands, cumBands);

        // Calculate loudness...
        var total = cumBands[cumBands.length - 1];
        minTotal = Math.min(total, minTotal);
        maxTotal = Math.max(total, maxTotal);
        minTotal = (minTotal * 999 + maxTotal) / 1000;
        maxTotal = (maxTotal * 999 + minTotal) / 1000;
        loudness = Math.max(0, (total - minTotal) / (maxTotal - minTotal));

        // Calculate tint...
/*        var centroid;
        for (centroid = 0; cumBands[centroid] < total / 2; ++centroid) {}
        tint = hslToRgb(centroid / cumBands.length * 0.67, 1, 0.5);
*/
        var rgb = [0, 0, 0];
        bands.forEach((v, i) => rgb[Math.floor(i / 8)] += v);
        var p = Math.min(rgb[0], rgb[1], rgb[2]);
        var q = Math.max(rgb[0], rgb[1], rgb[2]);
        if (p != q)
            rgb = rgb.map(x => (x - p) / (q - p));
        tint = rgb;

        // Calculate texture...
        var best = null;
        var bestScore = 0;
        for (var o = 0; o < waveHistory.length - viz.length; ++o) {
            if (o <= lastOffset - tooClose || o >= lastOffset + tooClose) {
                var score = 0;
                for (var p = 0; p < viz.length; p += 8) {
                    var x = viz[p] - waveHistory[p + o];
                    var y = viz[p + 1] - waveHistory[p + o + 1];
                    var z = viz[p + 2] - waveHistory[p + o + 2];
                    var w = viz[p + 3] - waveHistory[p + o + 3];
                    var a = viz[p + 4] - waveHistory[p + o + 4];
                    var b = viz[p + 5] - waveHistory[p + o + 5];
                    var c = viz[p + 6] - waveHistory[p + o + 6];
                    var d = viz[p + 7] - waveHistory[p + o + 7];
                    score += x * x + y * y + z * z + w * w + a * a + b * b + c * c + d * d;
                }
                if (score < bestScore || best === null) {
                    best = o;
                    bestScore = score;
                }
            }
        }

        // Calculate consistency...
        minScore = Math.min(bestScore, minScore);
        maxScore = Math.max(bestScore, maxScore);
        minScore = (minScore * 999 + maxScore) / 1000;
        maxScore = (maxScore * 999 + minScore) / 1000;
        var cc = 1.0 - (bestScore - minScore) / (maxScore - minScore);
        consistency = 1.0;//consistency * 0.8 + cc * 0.2;;

        // Output...
        if (loudness > 0) {
            //console.log(consistency);
            //console.log('info:', total, maxTotal, loudness, tint, bandMax);
            //console.log(rgb, total, loudness);//centroid / barkBands.length, tint, rgb);//total, bandMax, cumBandMax);
        }

        viz.set(waveHistory.subarray(best, best + viz.length));
        lastOffset = best;
    }
}

function animate() {
  updateAudio();
}

var shaderProgram;
function initShaders() {
  var fragmentShader = getShader(gl, "shader-fs");
  var vertexShader = getShader(gl, "shader-vs");
  shaderProgram = gl.createProgram();
  gl.attachShader(shaderProgram, vertexShader);
  gl.attachShader(shaderProgram, fragmentShader);
  gl.linkProgram(shaderProgram);
  if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
    alert("Could not initialise shaders");
  }
  gl.useProgram(shaderProgram);
  shaderProgram.vertexPositionAttribute = gl.getAttribLocation(shaderProgram, "aVertexPosition");
  gl.enableVertexAttribArray(shaderProgram.vertexPositionAttribute);
  shaderProgram.texture = gl.getUniformLocation(shaderProgram, "u_texture");
  shaderProgram.tint = gl.getUniformLocation(shaderProgram, "u_tint");
  shaderProgram.loudness = gl.getUniformLocation(shaderProgram, "u_loudness");
  shaderProgram.consistency = gl.getUniformLocation(shaderProgram, "u_consistency");
}

var squareVertexPositionBuffer;
function initBuffers() {
  squareVertexPositionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, squareVertexPositionBuffer);
  vertices = [
    1.0,  1.0,  0.0,
    -1.0,  1.0,  0.0,
    1.0, -1.0,  0.0,
    -1.0, -1.0,  0.0
  ];
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);
  squareVertexPositionBuffer.itemSize = 3;
  squareVertexPositionBuffer.numItems = 4;
}

var tex;

function drawScene() {
  var canvas = document.getElementById("canvas");
  gl.viewport(0, 0, gl.viewportWidth, gl.viewportHeight);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.bindBuffer(gl.ARRAY_BUFFER, squareVertexPositionBuffer);
  gl.vertexAttribPointer(shaderProgram.vertexPositionAttribute, squareVertexPositionBuffer.itemSize, gl.FLOAT, false, 0, 0);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.uniform1i(shaderProgram.texture, 0);
  gl.uniform3f(shaderProgram.tint, tint[0], tint[1], tint[2]);
  gl.uniform1f(shaderProgram.loudness, loudness);
  gl.uniform1f(shaderProgram.consistency, consistency);

  gl.drawArrays(gl.TRIANGLE_STRIP, 0, squareVertexPositionBuffer.numItems);
}

function tick() {
  requestAnimationFrame(tick);
  animate();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.ALPHA, viz.length, 1, 0, gl.ALPHA, gl.FLOAT, viz);
  drawScene();
}

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  gl.viewportWidth = canvas.width;
  gl.viewportHeight = canvas.height;
}

function webGLStart() {
  initAudio();

  var canvas = document.getElementById("canvas");
  initGL(canvas);

  window.addEventListener('resize', resizeCanvas, false);
  resizeCanvas();

  initShaders();
  initBuffers();

  tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

  gl.clearColor(0.0, 0.0, 0.0, 1.0);
  gl.enable(gl.DEPTH_TEST);
  tick();
}

window.addEventListener('load', () => {
    document.getElementById('player').crossOrigin = "anonymous";
    var client_id = "JlZIsxg2hY5WnBgtn3jfS0UYCl0K8DOg";
    SC.initialize({ client_id });
    SC.get("/tracks/341328214", {}, function(sound, error) {
        document.getElementById('player').src = `${sound.stream_url}?client_id=${client_id}`;
    });
}, false);
