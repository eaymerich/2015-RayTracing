"use strict";

/**************************************
* University of Central Florida
* COP6721 Ray Tracing
* Spring 2015
* Student: Edward Aymerich
**************************************/

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
	this.subtract = function ( b ){
		var result = new Vec3();
		result.x = this.x - b.x;
		result.y = this.y - b.y;
		result.z = this.z - b.z;
		return result;
	}
	this.cross = function ( b ){
		var result = new Vec3();
		result.x = this.y*b.z - this.z*b.y;
		result.y = this.z*b.x - this.x*b.z;
		result.z = this.x*b.y - this.y*b.x;
		return result;
	}
	this.normalize = function (){
		var len = Math.sqrt(this.x*this.x + this.y*this.y + this.z*this.z);
		this.x /= len;
		this.y /= len;
		this.z /= len;
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
	this.cols = 0.0; 
	this.rows = 0.0;// "rows" and "cols" are the the number of pixels rows and columns
	
	this.set = function (bounds, cols, rows){
		this.cols = cols;
		this.rows = rows;
		
		var fov = 60;
		var aspect = cols / rows;
		//console.log("aspect: " + aspect);
		var center = bounds.center();
		var diag = bounds.diagonal();
		this.eye.x = center[0];
		this.eye.y = center[1];
		this.eye.z = center[2] + diag;
		
		this.height = 2.0*Math.tan(0.5*fov*Math.PI/180.0);
		this.width = this.height * aspect;
	}
	
	this.rotate = function (bounds, angle) {
		var center = bounds.center();
		var diag = bounds.diagonal();
		var rad = angle*Math.PI/180.0;
		//console.log("angle="+angle+" rad="+rad);
		//console.log("preEye=["+this.eye.x+","+this.eye.y+","+this.eye.z+"]");
		this.eye.x = center[0] + Math.sin(rad)*diag;
		this.eye.y = center[1];
		this.eye.z = center[2] + Math.cos(rad)*diag;
		//console.log("postEye=["+this.eye.x+","+this.eye.y+","+this.eye.z+"]");
		
		//console.log("preU=["+this.U.x+","+this.U.y+","+this.U.z+"]");
		//console.log("preV=["+this.V.x+","+this.V.y+","+this.V.z+"]");
		//console.log("preW=["+this.W.x+","+this.W.y+","+this.W.z+"]");
		//this.W.subtract(this.eye,center);
		this.W.x = this.eye.x - center[0];
		this.W.y = this.eye.y - center[1];
		this.W.z = this.eye.z - center[2];
		//console.log("subW=["+this.W.x+","+this.W.y+","+this.W.z+"]");
		this.W.normalize();
		//console.log("normW=["+this.W.x+","+this.W.y+","+this.W.z+"]");
		this.U = this.V.cross(this.W);
		
		//console.log("U=["+this.U.x+","+this.U.y+","+this.U.z+"]");
		//console.log("V=["+this.V.x+","+this.V.y+","+this.V.z+"]");
		//console.log("W=["+this.W.x+","+this.W.y+","+this.W.z+"]");
	}
	
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
			this.cols, this.rows ]);
	}
	
	this.defaultInit = function (){
		this.eye.x = this.eye.y = this.eye.z = 0.0;
		this.U.x=1.0; this.U.y=0.0; this.U.z=0.0; 
		this.V.x=0.0; this.V.y=1.0; this.V.z=0.0;
		this.W.x=0.0; this.W.y=0.0; this.W.z=1.0;
	}
}

/**************************************
* Global variables
**************************************/
var devices;
var modelList=[
	"1.pdb",
	"h2.pdb",
	"h2o.pdb",
	"nh3.pdb",
	"ch4.pdb",
	"co2.pdb",
	"c2h2.pdb",
	"c2h4.pdb",
	"sf6.pdb",
	"c2h6.pdb",
	"benzene.pdb",
	"c6h12.pdb",
	"c60.pdb",
	"diamond.pdb",
	"dna.pdb",
	"3IZ4.pdb"
	];
var rotate = false;
	
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
	
	// Add found devices to HTML device select element
	var devicesSel = document.getElementById("ComputeDevices");
	var option;
	for(var i in devices){
		option = document.createElement("option");
		option.text=devices[i].getInfo(webcl.DEVICE_NAME);
		option.value = i;
		devicesSel.add(option,devicesSel.options[null]);
	}
	
	// Add models to HTML model select element
	var modelSel = document.getElementById("Models");
	for(var i in modelList){
		option = document.createElement("option");
		option.text = modelList[i];
		option.value = i;
		modelSel.add(option,modelSel.options[null]);
	}
}

function doRotate(){
	var button = document.getElementById("rotateButton");
	var drawButton = document.getElementById("drawButton");
	var modelSel = document.getElementById("Models");
	var deviceSel = document.getElementById("ComputeDevices");
	if(rotate){
		document.getElementById("demo").innerHTML = "Idle.";
		button.innerHTML = "Rotate";
		rotate = false;
		drawButton.disabled = false;
		modelSel.disabled  = false;
		deviceSel.disabled = false;
	}else{
		document.getElementById("demo").innerHTML = "Rotating...";
		button.innerHTML = "Stop";
		rotate = true;
		drawButton.disabled = true;
		modelSel.disabled  = true;
		deviceSel.disabled = true;
		animate();
	}
}

function animate(){
	var interval = 15;
	
// Prepare animation
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
	var kernelSrc = loadFromFile("code.cl");
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
	
	// Load molecule
	var modelSel = document.getElementById("Models");
	var molName = modelList[modelSel.selectedIndex];
	var molData = parsePDB(loadFromFile("mol/" + molName));
	var atomSize = molData.size;
	var atomData = new Float32Array(atomSize*4);
	var colorData = new Float32Array(atomSize*4);
	for(var i = 0; i < atomSize; i++){
		var atomId = molData.atomData[i*4];
		atomData[i*4] = molData.atomData[i*4+1];
		atomData[i*4+1] = molData.atomData[i*4+2];
		atomData[i*4+2] = molData.atomData[i*4+3];
		atomData[i*4+3] = molData.radiusData[atomId];
		colorData[i*4] = molData.colorData[atomId*4];
		colorData[i*4+1] = molData.colorData[atomId*4+1];
		colorData[i*4+2] = molData.colorData[atomId*4+2];
		colorData[i*4+3] = molData.colorData[atomId*4+3];
	}
	
	// Update camera to fit model.
	cam.set(molData.bounds, width, height);
	
	// Create buffers
	var pixelBufferSize = width * height * 4;
	var pixelBuffer = ctx.createBuffer(webcl.MEM_WRITE_ONLY, pixelBufferSize);
	var atomBuffer = ctx.createBuffer(webcl.MEM_READ_ONLY, atomData.byteLength);
	var colorBuffer = ctx.createBuffer(webcl.MEM_READ_ONLY, colorData.byteLength);
	
	// Send data to OpenCL device
	cmdQueue.enqueueWriteBuffer(atomBuffer, false, 0, atomData.byteLength, atomData, []);
	cmdQueue.enqueueWriteBuffer(colorBuffer, false, 0, colorData.byteLength, colorData, []);
	
	// Set kernel arguments.
	raytraceKernel.setArg(0, pixelBuffer);
	raytraceKernel.setArg(1, cam.toFloat32Array() );
	raytraceKernel.setArg(2, new Uint32Array([atomSize]) );
	raytraceKernel.setArg(3, atomBuffer);
	raytraceKernel.setArg(4, colorBuffer);
	
	var dim = 2;
	var localWS = getLocalWS(dim,raytraceKernel,device);
	var globalWS = [Math.ceil(width/localWS[0])*localWS[0], Math.ceil(height/localWS[1])*localWS[1]];
	
	
	function frame() {
		//console.log("frame");
		// Update camera
		cam.rotate(molData.bounds,angle);
		angle = (angle+1)%360;
		//cam.eye.x += 0.1;
		
		// Draw one frame
		cmdQueue.enqueueNDRangeKernel(raytraceKernel,dim,null,globalWS,localWS);
	
		// Read pixel data back from device.
		raytraceKernel.setArg(1, cam.toFloat32Array() );
		cmdQueue.enqueueReadBuffer(pixelBuffer,false,0,pixelBufferSize,imgData.data,[]);
		cmdQueue.finish();
		
		// Send img data to HTML.
		canvasCtx.putImageData(imgData, 0,0);
		
		if(rotate === false){
			// Release resources
			colorBuffer.release();
			atomBuffer.release();
			pixelBuffer.release();
			raytraceKernel.release();
			program.release();
			cmdQueue.release();
			ctx.release();
			clearInterval(id);
		}
	}
	
	var id = setInterval(frame,interval);
	var angle = 0;
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

function loadFromFile(fileName){
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


/**
 * Computes one frame.
 */
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
	var kernelSrc = loadFromFile("code.cl");
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
	
	// Load molecule
	var modelSel = document.getElementById("Models");
	var molName = modelList[modelSel.selectedIndex];
	var molData = parsePDB(loadFromFile("mol/" + molName));
	/*
	var s = "MolData\nsize: "+molData.size + 
	"\natom[0].radius: " + molData.radiusData[0] + 
	"\ncenter: " + molData.bounds.center() + 
	"\nbounds:" + molData.bounds.min + " ~ " + molData.bounds.max;
	console.log(s);
	*/
	cam.set(molData.bounds, width, height);
	var atomSize = molData.size;
	var atomData = new Float32Array(atomSize*4);
	var colorData = new Float32Array(atomSize*4);
	for(var i = 0; i < atomSize; i++){
		var atomId = molData.atomData[i*4];
		atomData[i*4] = molData.atomData[i*4+1];
		atomData[i*4+1] = molData.atomData[i*4+2];
		atomData[i*4+2] = molData.atomData[i*4+3];
		atomData[i*4+3] = molData.radiusData[atomId];
		colorData[i*4] = molData.colorData[atomId*4];
		colorData[i*4+1] = molData.colorData[atomId*4+1];
		colorData[i*4+2] = molData.colorData[atomId*4+2];
		colorData[i*4+3] = molData.colorData[atomId*4+3];
	}
	/*
	s = "";
	for(var i in molData.atomData){
		s += molData.atomData[i] + ",";
	}
	console.log("molData.atomData: " + s);
	s = "";
	for(var i in atomData){
		s += atomData[i] + ",";
	}
	console.log("atomData: " + s);
	s = "";
	for(var i in colorData){
		s += colorData[i] + ",";
	}
	console.log("colorData: " + s);
	*/
	
	// Create buffers,
	var pixelBufferSize = width * height * 4;
	var pixelBuffer = ctx.createBuffer(webcl.MEM_WRITE_ONLY, pixelBufferSize);
	var atomBuffer = ctx.createBuffer(webcl.MEM_READ_ONLY, atomData.byteLength);
	var colorBuffer = ctx.createBuffer(webcl.MEM_READ_ONLY, colorData.byteLength);
	
	
	// Send data to OpenCL device
	cmdQueue.enqueueWriteBuffer(atomBuffer, false, 0, atomData.byteLength, atomData, []);
	cmdQueue.enqueueWriteBuffer(colorBuffer, false, 0, colorData.byteLength, colorData, []);
	
	// Set kernel arguments.
	raytraceKernel.setArg(0, pixelBuffer);
	raytraceKernel.setArg(1, cam.toFloat32Array() );
	//raytraceKernel.setArg(2, new Uint32Array([atomSize,atomBuffer,colorBuffer]));
	raytraceKernel.setArg(2, new Uint32Array([atomSize]) );
	raytraceKernel.setArg(3, atomBuffer);
	raytraceKernel.setArg(4, colorBuffer);
	
	// Enqueue kernel execution.
	var dim = 2;
	var localWS = getLocalWS(dim,raytraceKernel,device);
	var globalWS = [Math.ceil(width/localWS[0])*localWS[0], Math.ceil(height/localWS[1])*localWS[1]];
	//console.log("Local WS: " + localWS);
	//console.log("Global WS: " + globalWS);
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
	colorBuffer.release();
	atomBuffer.release();
	pixelBuffer.release();
	raytraceKernel.release();
	program.release();
	cmdQueue.release();
	ctx.release();
	
	// Set a msg to let the user know that computation has finished...
	document.getElementById("demo").innerHTML = "Computing... Done!";
}
