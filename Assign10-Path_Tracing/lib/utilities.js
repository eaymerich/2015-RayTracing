/*
Copyright (c) 2014 Sumanta Pattanaik
File: utilities.js
Associated files:
	rendereV1.html, 
	rendereV1.js, 
	assimpJsonMeshObjectV1.js,
	ourJsonMeshObjectV1.js
	simpleMeshObjectV1.js
	
Uses public domain library gl-matrix.js (http://glmatrix.net/)

Permission is hereby granted, to the UCF Computer Graphics class students
to use this software for their class assignment. They can use, copy, modify, 
merge, as long as it is for the assignment submission purposes.

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

This version along with its associated files
supports Texturing of Triangular Mesh(es) using WebGL.

Sumanta Pattanaik
Sept 22, 2014.
*/
"use strict";

var rendererGlobal;
function initWebGL(canvas, optionalParameters) {
  // Initialize glContext to null.
  var glContext;

  try {
	// Try to grab the standard context. If it fails, fallback to experimental.
	glContext = canvas.getContext("webgl", optionalParameters);
  }
  catch(e) {  
	  alert("Unable to initialize WebGL. Your browser may not support it.");
  }

  return glContext;
}

function init(canvas, optionalParameters) {
  var gl = initWebGL(canvas, optionalParameters);
  if (gl) {
	gl.clearColor(0.0, 0.0, 0.0, 1.0);                      // Set clear color to black, fully opaque
	gl.enable(gl.DEPTH_TEST);                               // Enable depth testing
	gl.depthFunc(gl.LEQUAL);                                // Near things obscure far things
  }
  initRenderer(gl);
  return gl;
}

function initShaders(gl, vShaderCode, fShaderCode)
{
	function compilationError(shader, shaderType)
	{
		// Check the compile status
		if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
			// Something went wrong during compilation; 
			console.log("Error in compiling " + shaderType + " shader:" + 
				gl.getShaderInfoLog(shader));
			gl.deleteShader(shader);
			return true;
		}
		return false;
	}
	function linkError(p)
	{
		if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
			// something went wrong with the link
			var lastError = gl.getProgramInfoLog(p);
			console.log("Error in program linking:" + lastError);
			gl.deleteProgram(p);
			return true;
		}
		return false;			  
	}
	// 1. Create vertex shader , attach the source and compile
	var vertexShader = gl.createShader(gl.VERTEX_SHADER);
	gl.shaderSource(vertexShader, vShaderCode);	
	gl.compileShader(vertexShader);
	if (compilationError(vertexShader, "VERTEX")) return null;

	// 2. Create fragment shader, attach the source and compile
	var fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
	gl.shaderSource(fragmentShader, fShaderCode);
	gl.compileShader(fragmentShader);
	if (compilationError(fragmentShader, "FRAGMENT")) return null;

	 // 3. Create shader program, attach the shaders and link
	var program = gl.createProgram();
	gl.attachShader(program, vertexShader);
	gl.attachShader(program, fragmentShader);
	gl.linkProgram(program);
	if (linkError(program)) return null;
	return program;
}

function initBuffer(gl,attribArray) {
  var buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);  
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(attribArray), gl.STATIC_DRAW);
  return buffer;
}

function initElementsBuffer(gl,indexArray) {
  var buffer = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffer);  
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indexArray), gl.STATIC_DRAW);
  return buffer;
}

function bufferDraw(gl,drawMode,attributeSetter,nVertices,buffers)
{
	Object.keys(attributeSetter).forEach(function(attribName) {
		attributeSetter[attribName](buffers[attribName]);
    });
	if (buffers["index"]){
		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffers["index"]);
		gl.drawElements(gl[drawMode], nVertices, gl.UNSIGNED_SHORT, 0);
	}
	else{
		gl.drawArrays(gl[drawMode], 0, nVertices);	
	}
}
function deleteBuffers(gl,buffers){
	Object.keys(buffers).forEach(function(attribName) {
			gl.deleteBuffer(buffers[attribName]);
	});
}
function validData (A) {
	return (A.indexOf("NaN") >= 0);
}
function createBuffers (gl,meshData)
{
	var buffers={};
	Object.keys(meshData).forEach(function(name) {
		if(meshData[name]){
			if (!validData(meshData[name])){
				buffers[name] = (name == "index")?
					initElementsBuffer(gl, meshData[name]):
					initBuffer(gl, meshData[name]);
			}
			else console.log("Invalid "+ name+". Ex: There may be 'NaN' in data");
		}
    });
	return buffers;
}

function loadCubemap(gl, cubemappath, texturefiles) 
{
	var tex = gl.createTexture();
	tex.complete = false;
	gl.bindTexture(gl.TEXTURE_CUBE_MAP, tex);
	gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);
	gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER,gl.LINEAR);
	gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
	gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE); 

	var imgs = [];
	var count = 6;
	for (var i=0; i<6;i++){
		var img = new Image();
		imgs[i] = img;
		img.onload = function() {
		//console.log("Cubemap image loaded.");
			count--; 
			if (count==0){
				var directions =[
					gl.TEXTURE_CUBE_MAP_POSITIVE_X,
					gl.TEXTURE_CUBE_MAP_NEGATIVE_X,
					gl.TEXTURE_CUBE_MAP_POSITIVE_Y,
					gl.TEXTURE_CUBE_MAP_NEGATIVE_Y,
					gl.TEXTURE_CUBE_MAP_POSITIVE_Z,
					gl.TEXTURE_CUBE_MAP_NEGATIVE_Z
				];
				gl.bindTexture(gl.TEXTURE_CUBE_MAP, tex);
				gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
				for (var dir=0;dir<6;dir++){
					gl.texImage2D(directions[dir], 0, gl.RGBA,gl.RGBA, gl.UNSIGNED_BYTE, imgs[dir]);
				}
				gl.generateMipmap(gl.TEXTURE_CUBE_MAP);
				gl.bindTexture(gl.TEXTURE_CUBE_MAP, null);
				tex.complete = true;
			}
		}
		imgs[i].src = cubemappath+texturefiles[i];
	}
	return tex;
}

function createTextureFrom2DImage(gl,textureFileName,noMipMap)
{
	function completeTexture(imgData)
	{
		gl.bindTexture(gl.TEXTURE_2D, tex);
		gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
		if (noMipMap){
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, imgData);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		}else{
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, imgData);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);//gl.CLAMP_TO_EDGE
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);//gl.CLAMP_TO_EDGE
		gl.generateMipmap(gl.TEXTURE_2D);
		}
		gl.bindTexture(gl.TEXTURE_2D, null);
	}
	function isPowerOfTwo(x) {
		return (x & (x - 1)) == 0;
	}
	function nextHighestPowerOfTwo(x) {
		--x;
		for (var i = 1; i < 32; i <<= 1) {
			x = x | x >> i;
		}
		return x + 1;
	}
	
	if (textureFileName){
		//console.log(textureFileName);
		var tex=(rendererGlobal)?rendererGlobal.imageDictionary[textureFileName]:undefined;
		if (tex) return tex;
		tex = gl.createTexture();
		if (rendererGlobal) rendererGlobal.imageDictionary[textureFileName] = tex;
		tex.width = 0; tex.height = 0;
		var img = new Image();
		if (rendererGlobal) rendererGlobal.imagecount++;
		img.onload = function(){
			//console.log("image loaded. Size: "+img.width+"x"+img.height);
			if (!noMipMap&&(!isPowerOfTwo(img.width) || !isPowerOfTwo(img.height))) {
				// Scale up the texture to the next highest power of two dimensions.
				var canvas = document.createElement("canvas");
				canvas.width = nextHighestPowerOfTwo(img.width);
				canvas.height = nextHighestPowerOfTwo(img.height);
				tex.width = canvas.width;
				tex.height = canvas.height;
				//console.log(canvas.width+"x"+canvas.height);
				var ctx = canvas.getContext("2d");
				ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
				img = canvas;
			}
			else{
				tex.width = img.width;
				tex.height = img.height;
			}
			completeTexture(img);
			tex.complete = true;
			if (rendererGlobal) rendererGlobal.imagecount--; 
		};
		img.onerror = function() {
			console.log("ERROR: "+textureFileName+" does not exist or can not load.");
			if (rendererGlobal) rendererGlobal.imagecount--; 
		};
		img.src = textureFileName;
		return tex;
	}
	else {
		console.log("ERROR: Texture File does not exist.");
		return null;
	}
}

function createFrameBufferObject(gl,width,height,depthTextureFlag)
{
	var frameBuffer = gl.createFramebuffer(); 
	gl.bindFramebuffer (gl.FRAMEBUFFER, frameBuffer); 
	
	// Create the Color buffer 
	var colorTexture = gl.createTexture();
	gl.bindTexture(gl.TEXTURE_2D, colorTexture);
	gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); 
	gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); 
	gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); 
	gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); 
	gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null); 	
	gl.framebufferTexture2D (gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, colorTexture, 0); 
	gl.bindTexture(gl.TEXTURE_2D, null);

	// Create the depth buffer 
	var depthTexture=null;
	if (depthTextureFlag && gl.getExtension("WEBKIT_WEBGL_depth_texture")){
		depthTexture = gl.createTexture(); 
		gl.bindTexture(gl.TEXTURE_2D, depthTexture); 
		gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); 
		gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); 
		gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); 
		gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); 
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT, width, height, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_SHORT, null);	
		gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depthTexture, 0);
		gl.bindTexture(gl.TEXTURE_2D, null);
	}
	else{
		var depthBuffer = gl.createRenderbuffer(); 
		gl.bindRenderbuffer(gl.RENDERBUFFER, depthBuffer); 
		gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, width, height);
		gl.framebufferRenderbuffer( gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depthBuffer);
		gl.bindRenderbuffer(gl.RENDERBUFFER, null);
	}

	
	console.log("FrameBuffer creation "+ 
		((gl.checkFramebufferStatus(gl.FRAMEBUFFER) != gl.FRAMEBUFFER_COMPLETE)?"incomplete":"complete.")
	);
	
	gl.bindFramebuffer (gl.FRAMEBUFFER, null); 
	if (depthTextureFlag && depthTexture==null) 
		console.log("ERROR: Browser does not support depth texture.");
	return {
		frameBuffer:frameBuffer,
		colorTexture:colorTexture,
		depthTexture:depthTexture,
		width:width,
		height:height
	};
}

function initRenderer(gl) {
	rendererGlobal = {};
	rendererGlobal.LARGE = 1e+20;
	rendererGlobal.imagecount = 0;
	rendererGlobal.renderingSetUpComplete = function () {
        return (rendererGlobal.imagecount === 0);
    };
	function createTextureFromData (imgData) {
		var tex = gl.createTexture();
    	gl.bindTexture(gl.TEXTURE_2D, tex);
    	gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1,1, 0, gl.RGBA, gl.UNSIGNED_BYTE, imgData);
    	gl.generateMipmap(gl.TEXTURE_2D);
		tex.complete = true;
		return tex;
	}
	function createDefaultCubeMap() 
	{
		var tex = gl.createTexture();
		gl.bindTexture(gl.TEXTURE_CUBE_MAP, tex);
		gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER,gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER,gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE); 
		gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_X, 0, gl.RGBA,1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255,0,0,255]));
		gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_Y, 0, gl.RGBA,1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0,255,0,255]));
		gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_Z, 0, gl.RGBA,1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255,255,255,255]));
		gl.texImage2D(gl.TEXTURE_CUBE_MAP_NEGATIVE_X, 0, gl.RGBA,1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0,0,255,255]));
		gl.texImage2D(gl.TEXTURE_CUBE_MAP_NEGATIVE_Y, 0, gl.RGBA,1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255,255,0,255]));
		gl.texImage2D(gl.TEXTURE_CUBE_MAP_NEGATIVE_Z, 0, gl.RGBA,1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255,0,255,255]));
		//gl.generateMipmap(gl.TEXTURE_CUBE_MAP);
		tex.complete = true;
		return tex;
	}
	rendererGlobal.dummyWhiteTexture = createTextureFromData(new Uint8Array([255, 255, 255, 255]));
	rendererGlobal.dummyGrayTexture = createTextureFromData(new Uint8Array([128, 128, 128, 255]));
	rendererGlobal.dummyBlackTexture = createTextureFromData(new Uint8Array([0, 0, 0, 255]));
	rendererGlobal.dummyNormalMap = createTextureFromData(new Uint8Array([128, 128, 255, 255]));
	//rendererGlobal.dummyCubeMap = loadCubemap(gl,'webGLrenderingNotesCubeMap/skybox/',
	//	['posx.jpg','negx.jpg','posy.jpg','negy.jpg','posz.jpg','negz.jpg']);
	rendererGlobal.dummyCubeMap = createDefaultCubeMap();

	rendererGlobal.diffuseMap = rendererGlobal.dummyGrayTexture;
	rendererGlobal.specularMap = rendererGlobal.dummyBlackTexture;
	rendererGlobal.normalMap = rendererGlobal.dummyNormalMap;
	rendererGlobal.cubeMap = rendererGlobal.dummyCubeMap;
	
	rendererGlobal.imageDictionary = {};

	rendererGlobal.kd = vec3.fromValues(1,1,1);
	rendererGlobal.ks = vec3.fromValues(0,0,0);
	rendererGlobal.shininess = 1;
	rendererGlobal.ka = vec3.fromValues(0,0,0);
}

function parseJSON(jsonFile)
{
	var xhttp = new XMLHttpRequest();
	xhttp.open("GET", jsonFile, false);
	xhttp.overrideMimeType("application/document");
	xhttp.send(null);	
	var Doc = xhttp.responseText;
	return JSON.parse(Doc);
}

function Bounds(min,max)
{
	this.min=[Number.MAX_VALUE,Number.MAX_VALUE,Number.MAX_VALUE];
	this.max=[-Number.MAX_VALUE,-Number.MAX_VALUE,-Number.MAX_VALUE];
	if (min) this.min = [min[0],min[1],min[2]];
	if (max) this.max = [max[0],max[1],max[2]];
	this.center = function(){
		return [
			(this.min[0]+this.max[0])/2,
			(this.min[1]+this.max[1])/2,
			(this.min[2]+this.max[2])/2
		];
	};
	this.diagonal = function(){
		return Math.sqrt(
			(this.max[0]-this.min[0])*(this.max[0]-this.min[0])+
			(this.max[1]-this.min[1])*(this.max[1]-this.min[1])+
			(this.max[2]-this.min[2])*(this.max[2]-this.min[2])
		);
	};
	this.baseLength = function(){
			var length = this.max[0]-this.min[0];
			return (length<0)?0:length;
	};
	this.maxLength = function(){
			var length = Math.max(this.max[0]-this.min[0],this.max[1]-this.min[1],this.max[2]-this.min[2]);
			return (length<0)?0:length;
	};
	this.merge=function(b){
		var i;
		for (i=0; i<3; i++)this.min[i] = Math.min(this.min[i],b.min[i]);
		for (i=0; i<3; i++)this.max[i] = Math.max(this.max[i],b.max[i]);
	};
}
function getGeneralRotationMatrix(angle,center,axis)
{
	var m = mat4.create();
	mat4.translate(m,m,vec3.negate(vec3.create(),center));
	mat4.rotate(m,m,angle,axis);
	mat4.translate(m,m,center);
	return m;
}