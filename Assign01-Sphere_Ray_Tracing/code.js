"use strict";

/**************************************
* University of Central Florida
* COP6721 Ray Tracing
* Spring 2015
* Student: Edward Aymerich
**************************************/

/**************************************
* Global variables
**************************************/
var devices;

/**************************************
* 'Object' definitions
**************************************/
function Vec3() {
	this.x = 0.0;
	this.y = 0.0;
	this.z = 0.0;
	this.toFloat32Array = function () {
		return new Float32Array([this.x,this.y,this.z]);
	}
}

/**
 * This object tries to mimic the Camera struct defined in 'code.cl'.
 */
function Camera() {
	this.eye = new Vec3();
	this.U = new Vec3();
	this.V = new Vec3();
	this.W = new Vec3();
	this.width = 1.0;
	this.height = 1.0; // "width" and "height" are width and heigh of the canvas window in scene space. 
	this.rows = 0.0; 
	this.cols = 0.0;// "rows" and "cols" are the the number of pixels rows and columns
	
	/**
	 * This function is used to 'send' the camera to the kernel.
	 */
	this.toFloat32Array = function (){
		return new Float32Array([
			this.eye.x, this.eye.y, this.eye.z,
			this.U.x, this.U.y, this.U.z,
			this.V.x, this.V.y, this.V.z,
			this.W.x, this.W.y, this.W.z,
			this.width, this.height,
			this.rows, this.cols ]);
	}
	
	this.defaultInit = function (){
		this.eye.x = this.eye.y = this.eye.z = 0.0;
		this.U.x=1.0; this.U.y=0.0; this.U.z=0.0; 
		this.V.x=0.0; this.V.y=1.0; this.V.z=0.0;
		this.W.x=0.0; this.W.y=0.0; this.W.z=-1.0;
	}
}

/**************************************
* Function definitions
**************************************/
function main() {
	// First check if the WebCL extension is installed at all 
	if (window.WebCL == undefined) {
		alert("Your system does not support WebCL. " +
			  "Make sure that you have both the OpenCL driver " +
			  "and the WebCL browser extension installed.");
		return false;
	}else{
		console.log("WebCL OK!");
	}
	
	// Get a list of available CL platforms and associated
	// available devices on each platform. If there are no platforms,
	// or no available devices on any platform, then we can conclude
	// that WebCL is not available.
	devices = [];
	try {
		var platforms = webcl.getPlatforms();
		console.log ( "Found " + platforms.length + " platform"
			+ (platforms.length == 1 ? "" : "s")
			+ "." );
		var devs = [];
		for (var i in platforms) {
			console.log("Platform[" + i + "]: " + getPlatformInfo(platforms[i]));	  
			devs = platforms[i].getDevices(webcl.DEVICE_TYPE_ALL);
			console.log("Devices: " + devs.length);
			if (devs[0].getInfo(webcl.DEVICE_TYPE) === webcl.DEVICE_TYPE_CPU){
				console.log("CPU device: " + devs[0].getInfo(webcl.DEVICE_NAME) );
			}else if (devs[0].getInfo(webcl.DEVICE_TYPE) === webcl.DEVICE_TYPE_GPU){
				console.log("GPU device: " + devs[0].getInfo(webcl.DEVICE_NAME) );
			}
			for (var j in devs){
				devices.push(devs[j]);
			}
		}
	} catch (e) {
		alert("Platform or device inquiry failed.\n"+"Error: "+e.toString());
		throw e;
	}
	
	// Add found devices to HTML select element
	var devicesSel = document.getElementById("ComputeDevices");
	var option;
	for(var i in devices){
		option = document.createElement("option");
		option.text=devices[i].getInfo(webcl.DEVICE_NAME);
		option.value = i;
		devicesSel.add(option,devicesSel.options[null]);
	}
}

function getPlatformInfo(platform){
	var name = platform.getInfo (webcl.PLATFORM_NAME);
	var s = name + "\n";
	s += "vendor: " + platform.getInfo (webcl.PLATFORM_VENDOR) + "\n";
	s += "version: " + platform.getInfo (webcl.PLATFORM_VERSION) + "\n";
	s += "profile: " + platform.getInfo (webcl.PLATFORM_PROFILE) + "\n";
	//s += "extensions: " + platform.getInfo (webcl.PLATFORM_EXTENSIONS) + "\n";
	return s;
}

function loadKernelFromFile(fileName){
	var mHttpReq = new XMLHttpRequest();
	mHttpReq.open("GET", fileName, false);
	mHttpReq.overrideMimeType("text/plain");
	mHttpReq.send(null);
	return mHttpReq.responseText;
}

/*-------------------------------------
* I don't understand what this function does. 
* I need to study it closer.
*/
function getLocalWS(dim,kernel,device){
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
	var maxLocalGroupSize = kernel.getWorkGroupInfo(device,webcl.KERNEL_PREFERRED_WORK_GROUP_SIZE_MULTIPLE);
	var xSize, ySize;
	switch(dim){
	case 1: return [maxLocalGroupSize]; 
		break;
	case 2: xSize = Math.floor(Math.sqrt(maxLocalGroupSize));
		if (!isPowerOfTwo(xSize)) xSize = nextHighestPowerOfTwo(xSize);
		return [xSize, Math.floor(maxLocalGroupSize/xSize)];
		break;
	case 3: xSize = Math.floor(Math.pow(maxLocalGroupSize,1/3));
		if (!isPowerOfTwo(xSize)) xSize = nextHighestPowerOfTwo(xSize);
		ySize = Math.floor(Math.sqrt(maxLocalGroupSize/xSize));
		if (!isPowerOfTwo(ySize)) ySize = nextHighestPowerOfTwo(ySize);
		return [xSize, ySize, Math.floor(maxLocalGroupSize/(xSize*ySize))];
		break;
	}	
}

function compute() {
	// Set a msg to let the user know that computation has begun...
	document.getElementById("demo").innerHTML = "Computing...";
   
	// Get the width and height of the final image.
	var canvasElement = document.getElementById("canvasElement");
	var width = Number(canvasElement.getAttribute("width"));
	var height = Number(canvasElement.getAttribute("height"));
	
	// Create an image to write to.
	var canvasCtx = canvasElement.getContext("2d");
	var imgData = canvasCtx.createImageData(width,height);
	
	// Create a camera.
	var cam = new Camera();
	cam.defaultInit();
	cam.width = 2.66;
	cam.height = 2.0;
	cam.cols = width;
	cam.rows = height;
	/*
	var arr = cam.toFloat32Array();
	var i, s = "";
	for(i in arr){
		s += arr[i] + ","
	}
	console.log("Camera: " + s);
	console.log("Camera size: " + arr.length);
	*/
	
	// Get selected device.
	var deviceSel = document.getElementById("ComputeDevices");
	var device = devices[deviceSel.selectedIndex];
	
	// Create WebCL context.
	var ctx = webcl.createContext (device);
	if (!ctx){ 
		alert("Unable to create CL context for selected device");
		return;
	}else{
		console.log("WebCL context created.");
	}
	
	// Create command queue.
	var cmdQueue = ctx.createCommandQueue ();
	
	// Load and compile program.
	var kernelSrc = loadKernelFromFile("code.cl");
	var program = ctx.createProgram(kernelSrc);
	try {
		program.build ();
	} catch(e) {
		alert ("Failed to build WebCL program. Error "
		   + program.getBuildInfo (device, webcl.PROGRAM_BUILD_STATUS)
		   + ":  " + program.getBuildInfo (device, webcl.PROGRAM_BUILD_LOG));
		throw e;
	}
	
	// Create kernel.
	var raytraceKernel = program.createKernel("raytrace");
	
	// Create buffers.
	var pixelBufferSize = width * height * 4;
	var pixelBuffer = ctx.createBuffer(webcl.MEM_WRITE_ONLY, pixelBufferSize);
	
	// Set kernel arguments.
	raytraceKernel.setArg(0, pixelBuffer);
	raytraceKernel.setArg(1, cam.toFloat32Array() );
	
	// Enqueue kernel execution.
	var dim = 2;
	var localWS = getLocalWS(dim,raytraceKernel,device);
	var globalWS = [Math.ceil(width/localWS[0])*localWS[0], Math.ceil(height/localWS[1])*localWS[1]];
	console.log("Local WS: " + localWS);
	console.log("Global WS: " + globalWS);
	cmdQueue.enqueueNDRangeKernel(raytraceKernel,dim,null,globalWS,localWS);
	
	// Read pixel data back from device.
	cmdQueue.enqueueReadBuffer(pixelBuffer,false,0,pixelBufferSize,imgData.data,[]);
	cmdQueue.finish();
	
	/*
	// Manipulate img data directly in JavaScript.
	var i;
	for (i = 0; i < imgData.data.length; i += 4) {
	    imgData.data[i+0] = 255;
	    imgData.data[i+1] = 0;
	    imgData.data[i+2] = 0;
	    imgData.data[i+3] = 255;
	}*/
	
	// Send img data to HTML.
	canvasCtx.putImageData(imgData, 0,0);
	
	// Release resources
	pixelBuffer.release();
	raytraceKernel.release();
	program.release();
	cmdQueue.release();
	ctx.release();
	
	// Set a msg to let the user know that computation has finished...
	document.getElementById("demo").innerHTML = "Computing... Done!";
}
