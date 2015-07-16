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
		//this.height = 2.0;
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
var triModelList=[
	"teapot.json",
	"house.json",
	"house_of_parliament.json"
	];
var rotate = false;
var controls = [];
var cl_resources = [];
var cam = new Camera();
var width, height;
var canvasCtx;
var imgData;
// WebCL global variables
var device;
var ctx;
var cmdQueue;
var program;
var kernels = [];
var localWS = [];
var globalWS = [];
var dim = 2;
var rayBuffer;
var pixelBuffer;
	
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
	
	// Add mol models to HTML model select element
	var modelSel = document.getElementById("Models");
	for(var i in modelList){
		option = document.createElement("option");
		option.text = modelList[i];
		option.value = i;
		modelSel.add(option,modelSel.options[null]);
	}
	
	// Add triangle models to HTML model select element
	var triModelSel = document.getElementById("TriModels");
	for(var i in triModelList){
		option = document.createElement("option");
		option.text = triModelList[i];
		option.value = i;
		triModelSel.add(option,triModelSel.options[null]);
	}
	
	// Add controls 
	controls.push(document.getElementById("Models"));
	controls.push(document.getElementById("TriModels"));
	controls.push(document.getElementById("rotateButton"));
	controls.push(document.getElementById("drawButton"));
	controls.push(document.getElementById("rotateButtonTri"));
	controls.push(document.getElementById("drawButtonTri"));
	controls.push(document.getElementById("drawButtonBoth"));
	controls.push(document.getElementById("rotateButtonBoth"));
	
	// Get the width and height of the final image.
	var canvasElement = document.getElementById("canvasElement");
	width = Number(canvasElement.getAttribute("width"));
	height = Number(canvasElement.getAttribute("height"));
	
	// Create an image to write to.
	canvasCtx = canvasElement.getContext("2d");
	imgData = canvasCtx.createImageData(width,height);
}

function disableAllControls(){
	for(var i in controls){
		controls[i].disabled = true;
	}
}

function enableAllControls(){
	for(var i in controls){
		controls[i].disabled = false;
	}
}

function doRotate(){
	var button = document.getElementById("rotateButton");
	if(rotate){
		document.getElementById("demo").innerHTML = "Idle.";
		button.innerHTML = "Rotate";
		rotate = false;
		enableAllControls();
	}else{
		document.getElementById("demo").innerHTML = "Rotating...";
		button.innerHTML = "Stop";
		rotate = true;
		disableAllControls();
		button.disabled = false;
		animate();
	}
}

function doTriRotate(){
	var button = document.getElementById("rotateButtonTri");
	if(rotate){
		document.getElementById("demo").innerHTML = "Idle.";
		button.innerHTML = "Rotate";
		rotate = false;
		enableAllControls();
	}else{
		document.getElementById("demo").innerHTML = "Rotating...";
		button.innerHTML = "Stop";
		rotate = true;
		disableAllControls();
		button.disabled = false;
		animateTri();
	}
}

function doBothRotate(){
	var button = document.getElementById("rotateButtonBoth");
	if(rotate){
		document.getElementById("demo").innerHTML = "Idle.";
		button.innerHTML = "Rotate Both Models";
		rotate = false;
		enableAllControls();
	}else{
		document.getElementById("demo").innerHTML = "Rotating...";
		button.innerHTML = "Stop";
		rotate = true;
		disableAllControls();
		button.disabled = false;
		animateBoth();
	}
}

function releaseCLResources(){
	var i = 0;
	while(cl_resources.length > 0){
		var res = cl_resources.pop();
		res.release();
		i++;
	}
	console.log("WebCL: " + i + " resources released.");
	var kernels = [];
	var localWS = [];
	var globalWS = [];
}

/**
 * Creates a WebCL context, command queue and program.
 */
function createCLBasicResources(){
	// Get selected device.
	var deviceSel = document.getElementById("ComputeDevices");
	device = devices[deviceSel.selectedIndex];
	
	// Create WebCL context.
	ctx = webcl.createContext (device);
	if (!ctx){ 
		alert("Unable to create CL context for selected device");
		return;
	}else{
		console.log("WebCL: context created.");
	}
	cl_resources.push(ctx);
	
	// Create command queue.
	cmdQueue = ctx.createCommandQueue ();
	cl_resources.push(cmdQueue);
	
	// Load and compile program.
	var kernelSrc = loadFromFile("code.cl");
	program = ctx.createProgram(kernelSrc);
	try {
		program.build ();
	} catch(e) {
		alert ("Failed to build WebCL program. Error "
		   + program.getBuildInfo (device, webcl.PROGRAM_BUILD_STATUS)
		   + ":  " + program.getBuildInfo (device, webcl.PROGRAM_BUILD_LOG));
		releaseCLResources();
		throw e;
	}
	cl_resources.push(program);
}

function prepareInitTrace(){
	// Request size of Ray struct
	var raySize = getRaySize(program,cmdQueue,ctx);
	
	// Create kernel.
	var initTraceKernel = program.createKernel("initTrace");
	kernels["initTrace"] = initTraceKernel;
	cl_resources.push(initTraceKernel);
	
	// Create buffers.
	var pixelBufferSize = width * height * 4;
	var rayBufferSize = width * height * raySize;
	pixelBuffer = ctx.createBuffer(webcl.MEM_WRITE_ONLY, pixelBufferSize);
	rayBuffer = ctx.createBuffer(webcl.MEM_READ_WRITE, rayBufferSize);
	cl_resources.push(pixelBuffer);
	cl_resources.push(rayBuffer);
	
	// Set kernel arguments.
	initTraceKernel.setArg(0, pixelBuffer);
	//initTraceKernel.setArg(1, cam.toFloat32Array() );
	initTraceKernel.setArg(2, rayBuffer);
	
	// Calculate local and global WS
	localWS["initTrace"] = getLocalWS(dim,initTraceKernel,device);
	globalWS["initTrace"] = [Math.ceil(width/localWS["initTrace"][0])*localWS["initTrace"][0], 
				Math.ceil(height/localWS["initTrace"][1])*localWS["initTrace"][1]];
	
}

function prepareMolTrace(molData){
	// Create kernel.
	var molTraceKernel = program.createKernel("molTrace");
	kernels["molTrace"] = molTraceKernel;
	cl_resources.push(molTraceKernel);
	
	// Transform molecule data into my own format
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
	
	// Create buffers.
	var atomBuffer = ctx.createBuffer(webcl.MEM_READ_ONLY, atomData.byteLength);
	var colorBuffer = ctx.createBuffer(webcl.MEM_READ_ONLY, colorData.byteLength);
	cl_resources.push(atomBuffer);
	cl_resources.push(colorBuffer);
	
	// Send data to OpenCL device
	cmdQueue.enqueueWriteBuffer(atomBuffer, false, 0, atomData.byteLength, atomData, []);
	cmdQueue.enqueueWriteBuffer(colorBuffer, false, 0, colorData.byteLength, colorData, []);
	cmdQueue.finish();
	
	// Set kernel arguments.
	molTraceKernel.setArg(0, pixelBuffer);
	//molTraceKernel.setArg(1, cam.toFloat32Array() );
	molTraceKernel.setArg(2, rayBuffer);
	molTraceKernel.setArg(3, new Uint32Array([atomSize]) );
	molTraceKernel.setArg(4, atomBuffer);
	molTraceKernel.setArg(5, colorBuffer);
	
	// Calculate local and global WS
	localWS["molTrace"] = getLocalWS(dim,molTraceKernel,device);
	globalWS["molTrace"] = [Math.ceil(width/localWS["molTrace"][0])*localWS["molTrace"][0],
				Math.ceil(height/localWS["molTrace"][1])*localWS["molTrace"][1]];
}

function prepareMeshTrace(meshData){
	// Create kernel.
	var meshTraceKernel = program.createKernel("meshTrace");
	kernels["meshTrace"] = meshTraceKernel;
	cl_resources.push(meshTraceKernel);
	
	// Transform triangles data into my own format.
	var posArray = toPosArray(meshData);
	var normalArray = toNormalArray(meshData);
	var indexArray = new Uint32Array(meshData.materialIndices);
	var colorArray = new Float32Array(meshData.materials);
	
	// Create buffers.
	var meshPosBuffer = ctx.createBuffer(webcl.MEM_READ_ONLY, posArray.byteLength);
	var meshNormalBuffer = ctx.createBuffer(webcl.MEM_READ_ONLY, normalArray.byteLength);
	var indexBuffer = ctx.createBuffer(webcl.MEM_READ_ONLY, indexArray.byteLength);
	var colorBuffer = ctx.createBuffer(webcl.MEM_READ_ONLY, colorArray.byteLength);
	cl_resources.push(meshPosBuffer);
	cl_resources.push(meshNormalBuffer);
	cl_resources.push(indexBuffer);
	cl_resources.push(colorBuffer);
	
	// Send data to OpenCL device
	cmdQueue.enqueueWriteBuffer(meshPosBuffer, false, 0, posArray.byteLength, posArray, []);
	cmdQueue.enqueueWriteBuffer(meshNormalBuffer, false, 0, normalArray.byteLength, normalArray, []);
	cmdQueue.enqueueWriteBuffer(indexBuffer, false, 0, indexArray.byteLength, indexArray, []);
	cmdQueue.enqueueWriteBuffer(colorBuffer, false, 0, colorArray.byteLength, colorArray, []);
	cmdQueue.finish();
	
	// Set kernel arguments.
	meshTraceKernel.setArg(0, pixelBuffer);
	//meshTraceKernel.setArg(1, cam.toFloat32Array() );
	meshTraceKernel.setArg(2, rayBuffer);
	meshTraceKernel.setArg(3, new Uint32Array([meshData.nTriangles]) );
	meshTraceKernel.setArg(4, meshPosBuffer);
	meshTraceKernel.setArg(5, meshNormalBuffer);
	meshTraceKernel.setArg(6, indexBuffer);
	meshTraceKernel.setArg(7, colorBuffer);
	
	// Calculate local and global WS
	localWS["meshTrace"] = getLocalWS(dim,meshTraceKernel,device);
	globalWS["meshTrace"] = [Math.ceil(width/localWS["meshTrace"][0])*localWS["meshTrace"][0],
				Math.ceil(height/localWS["meshTrace"][1])*localWS["meshTrace"][1]];
	
}

function executeInitTrace(){
	kernels["initTrace"].setArg(1, cam.toFloat32Array() );
	cmdQueue.enqueueNDRangeKernel(kernels["initTrace"],dim,null,globalWS["initTrace"],localWS["initTrace"]);
}

function executeMolTrace(){
	kernels["molTrace"].setArg(1, cam.toFloat32Array() );
	cmdQueue.enqueueNDRangeKernel(kernels["molTrace"],dim,null,globalWS["molTrace"],localWS["molTrace"]);
}

function executeMeshTrace(){
	kernels["meshTrace"].setArg(1, cam.toFloat32Array() );
	cmdQueue.enqueueNDRangeKernel(kernels["meshTrace"],dim,null,globalWS["meshTrace"],localWS["meshTrace"]);
}

function sendImagetoHTML(){
	// Read pixel data back from device
	cmdQueue.enqueueReadBuffer(pixelBuffer,false,0,imgData.data.length,imgData.data,[]);
	cmdQueue.finish();
	
	// Send img data to HTML.
	canvasCtx.putImageData(imgData, 0,0);
}

/**
 * Computes one frame.
 */
function compute() {
	// Set a msg to let the user know that computation has begun...
	document.getElementById("demo").innerHTML = "Computing...";
   
	// Load molecule
	var modelSel = document.getElementById("Models");
	var molName = modelList[modelSel.selectedIndex];
	var molData = parsePDB(loadFromFile("mol/" + molName));
	
	// Update camera position.
	cam.defaultInit();
	cam.set(molData.bounds, width, height);

	// Prepare WebCL
	createCLBasicResources();
	prepareInitTrace();
	prepareMolTrace(molData);
	
	// Draw one frame
	executeInitTrace();
	executeMolTrace();

	// Send rendered image to HTML.
	sendImagetoHTML();
	
	// Release resources
	releaseCLResources();
	
	// Set a msg to let the user know that computation has finished...
	document.getElementById("demo").innerHTML = "Computing... Done!";
}

function computeTri(){
	// Load triangle model
	var triModelSel = document.getElementById("TriModels");
	var triModelName = triModelList[triModelSel.selectedIndex];
	var meshData = parseMeshJSON("tri/" + triModelName);
		
	// Update camera position.
	cam.defaultInit();
	cam.set(meshData.bounds, width, height);
	
	// Prepare WebCL
	createCLBasicResources();
	prepareInitTrace();
	prepareMeshTrace(meshData);
	
	// Draw one frame
	executeInitTrace();
	executeMeshTrace();

	// Send rendered image to HTML.
	sendImagetoHTML();
	
	// Release resources
	releaseCLResources();
}

function computeBoth(){
	// Load molecule model
	var modelSel = document.getElementById("Models");
	var molName = modelList[modelSel.selectedIndex];
	var molData = parsePDB(loadFromFile("mol/" + molName));
	
	// Load mesh model
	var triModelSel = document.getElementById("TriModels");
	var triModelName = triModelList[triModelSel.selectedIndex];
	var meshData = parseMeshJSON("tri/" + triModelName);
	//console.log("Mol bounds: " + molData.bounds.min + " --- " + molData.bounds.min);
	//console.log("Mesh bounds: " + meshData.bounds.min + " --- " + meshData.bounds.min);
	
	// Create a new bound for both models
	var bounds = new Bounds();
	bounds.merge(molData.bounds);
	bounds.merge(meshData.bounds);
	//console.log("bounds: " + bounds.min + " --- " + bounds.min);
	
	// Update camera position.
	cam.defaultInit();
	cam.set(bounds, width, height);
	
	// Prepare WebCL
	createCLBasicResources();
	prepareInitTrace();
	prepareMolTrace(molData);
	prepareMeshTrace(meshData);
	
	// Draw one frame
	executeInitTrace();
	executeMolTrace();
	executeMeshTrace();
	
	// Send rendered image to HTML.
	sendImagetoHTML();
	
	// Release resources
	releaseCLResources();
}

function animate(){
	var interval = 15;
	
// Prepare animation
	// Load molecule
	var modelSel = document.getElementById("Models");
	var molName = modelList[modelSel.selectedIndex];
	var molData = parsePDB(loadFromFile("mol/" + molName));
	
	// Update camera position.
	cam.defaultInit();
	cam.set(molData.bounds, width, height);

	// Prepare WebCL
	createCLBasicResources();
	prepareInitTrace();
	prepareMolTrace(molData);
		
	function frame() {
		// Update camera
		cam.rotate(molData.bounds,angle);
		angle = (angle+1)%360;
		
		// Draw one frame
		executeInitTrace();
		executeMolTrace();
	
		// Send rendered image to HTML.
		sendImagetoHTML();
		
		if(rotate === false){
			// Release resources
			releaseCLResources();
			clearInterval(id);
		}
	}
	
	var id = setInterval(frame,interval);
	var angle = 0;
}

function animateTri(){
	var interval = 15;

	// Load triangle model
	var triModelSel = document.getElementById("TriModels");
	var triModelName = triModelList[triModelSel.selectedIndex];
	var meshData = parseMeshJSON("tri/" + triModelName);
		
	// Create a camera.
	cam.defaultInit();
	cam.set(meshData.bounds, width, height);
	
	// Prepare WebCL
	createCLBasicResources();
	prepareInitTrace();
	prepareMeshTrace(meshData);
	
	function frame(){
		// Update camera
		cam.rotate(meshData.bounds,angle);
		angle = (angle+1)%360;
		
		// Draw one frame
		executeInitTrace();
		executeMeshTrace();
		
		// Send rendered image to HTML.
		sendImagetoHTML();
		
		if(rotate === false){
			// Release resources
			releaseCLResources();
			clearInterval(id);
		}
	}
	var id = setInterval(frame,interval);
	var angle = 0;
}

function animateBoth(){
	var interval = 15;
	
	// Load molecule model
	var modelSel = document.getElementById("Models");
	var molName = modelList[modelSel.selectedIndex];
	var molData = parsePDB(loadFromFile("mol/" + molName));
	
	// Load mesh model
	var triModelSel = document.getElementById("TriModels");
	var triModelName = triModelList[triModelSel.selectedIndex];
	var meshData = parseMeshJSON("tri/" + triModelName);
	
	// Create a new bound for both models
	var bounds = new Bounds();
	bounds.merge(molData.bounds);
	bounds.merge(meshData.bounds);
	
	// Update camera position.
	cam.defaultInit();
	cam.set(bounds, width, height);
	
	// Prepare WebCL
	createCLBasicResources();
	prepareInitTrace();
	prepareMolTrace(molData);
	prepareMeshTrace(meshData);
	
	function frame(){
		// Update camera
		cam.rotate(bounds,angle);
		angle = (angle+1)%360;
		
		// Draw one frame
		executeInitTrace();
		executeMolTrace();
		executeMeshTrace();
		
		// Send rendered image to HTML.
		sendImagetoHTML();
		if(rotate === false){
			// Release resources
			releaseCLResources();
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
 * Request the size of Ray struct.
 */
function getRaySize( program , cmdQueue , ctx ){
	var sizeofRayKernel = program.createKernel("sizeofRay");
	var raySizeBuffer = ctx.createBuffer(webcl.MEM_WRITE_ONLY, 4);
	var raySizeData = new Uint32Array(1);
	sizeofRayKernel.setArg(0, raySizeBuffer);
	cmdQueue.enqueueNDRangeKernel(sizeofRayKernel,1,null,[1],[1]);
	cmdQueue.enqueueReadBuffer(raySizeBuffer,false,0,4,raySizeData,[]);
	cmdQueue.finish();
	raySizeBuffer.release();
	sizeofRayKernel.release();
	var raySize = raySizeData[0];
	return raySize;
}

function toNormalArray(meshData){
	var ps0 = 3*4; // triangle size in array.
	var ps1 = 3*3; // triangle size in mesh data.
	var pos = new Float32Array(meshData.nTriangles*ps0);
	for(var i = 0; i < meshData.nTriangles; i++){
		var pp0 = i*ps0;// Point position in array.
		var pp1 = i*ps1;// Point position in mesh data.
		// p0
		pos[pp0+0] = meshData.normals[pp1+0];
		pos[pp0+1] = meshData.normals[pp1+1];
		pos[pp0+2] = meshData.normals[pp1+2];
		pos[pp0+3] = 0;
		// p1
		pos[pp0+4] = meshData.normals[pp1+3];
		pos[pp0+5] = meshData.normals[pp1+4];
		pos[pp0+6] = meshData.normals[pp1+5];
		pos[pp0+7] = 0;
		// p2
		pos[pp0+8] = meshData.normals[pp1+6];
		pos[pp0+9] = meshData.normals[pp1+7];
		pos[pp0+10] = meshData.normals[pp1+8];
		pos[pp0+11] = 0;
	}
	return pos;
}

function toPosArray(meshData){
	var ps0 = 3*4; // triangle size in array.
	var ps1 = 3*3; // triangle size in mesh data.
	var pos = new Float32Array(meshData.nTriangles*ps0);
	for(var i = 0; i < meshData.nTriangles; i++){
		var pp0 = i*ps0;// Point position in array.
		var pp1 = i*ps1;// Point position in mesh data.
		// p0
		pos[pp0+0] = meshData.positions[pp1+0];
		pos[pp0+1] = meshData.positions[pp1+1];
		pos[pp0+2] = meshData.positions[pp1+2];
		pos[pp0+3] = 1;
		// p1
		pos[pp0+4] = meshData.positions[pp1+3];
		pos[pp0+5] = meshData.positions[pp1+4];
		pos[pp0+6] = meshData.positions[pp1+5];
		pos[pp0+7] = 1;
		// p2
		pos[pp0+8] = meshData.positions[pp1+6];
		pos[pp0+9] = meshData.positions[pp1+7];
		pos[pp0+10] = meshData.positions[pp1+8];
		pos[pp0+11] = 1;
	}
	return pos;
}



