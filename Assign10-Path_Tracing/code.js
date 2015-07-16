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
	this.set = function (x,y,z) {
		this.x = x;
		this.y = y;
		this.z = z;
	}
	this.setVec = function(v){
		this.x = v.x;
		this.y = v.y;
		this.z = v.z;
	}
	this.toFloat32Array = function () {
		return new Float32Array([this.x,this.y,this.z,1.0]);
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
	this.toStr = function (){
		return "["+this.x+","+this.y+","+this.z+"]";
	}
}

function Color() {
	this.r = 0.0;
	this.g = 0.0;
	this.b = 0.0;
	this.a = 0.0;
}

function Sphere(){
	this.c = new Vec3();
	this.r = 1.0;
	this.matId = 0;
	
	this.bounds = function (){
		return new Bounds(
			[this.c.x-this.r, this.c.y-this.r, this.c.z-this.r],
			[this.c.x+this.r, this.c.y+this.r, this.c.z+this.r]);
	}
}

function Triangle(){
	this.p0 = new Vec3();
	this.p1 = new Vec3();
	this.p2 = new Vec3();
	this.n0 = new Vec3();
	this.n1 = new Vec3();
	this.n2 = new Vec3();
	this.matId = 0;
	
	this.bounds = function (){
		var xmin = Math.min(Math.min(this.p0.x, this.p1.x), this.p2.x);
		var ymin = Math.min(Math.min(this.p0.y, this.p1.y), this.p2.y);
		var zmin = Math.min(Math.min(this.p0.z, this.p1.z), this.p2.z);
		var xmax = Math.max(Math.max(this.p0.x, this.p1.x), this.p2.x);
		var ymax = Math.max(Math.max(this.p0.y, this.p1.y), this.p2.y);
		var zmax = Math.max(Math.max(this.p0.z, this.p1.z), this.p2.z);
		return new Bounds([xmin, ymin, zmin],[xmax,ymax,zmax]);
	}
}

function Mesh(){
	this.posData = [];
	this.normalData = [];
	this.boxSizeData = [];
	this.posBuffer = null;
	this.normalBuffer = null;
	this.boxSizeBuffer = null;
	this.bounds = new Bounds();
	this.ntriangles = 0;
	this.nslabs = 1;
	this.matId = 0;
	
	this.loadFromJSON = function (jmesh,nslabs,matId){
		this.bounds = jmesh.bounds;
		this.ntriangles = jmesh.nTriangles;
		this.nslabs = nslabs;
		splitMeshData(jmesh, this.posData, this.normalData, this.boxSizeData, nslabs);
		this.matId = matId;
	}
	
	this.normalize = function() {
		// Center object
		var centerx = (this.bounds.max[0] + this.bounds.min[0])/2.0;
		var centery = (this.bounds.max[1] + this.bounds.min[1])/2.0;
		var centerz = (this.bounds.max[2] + this.bounds.min[2])/2.0;
		
		// Scale data to -0.5 ~ 0.5
		var dimx = this.bounds.max[0] - this.bounds.min[0];
		var dimy = this.bounds.max[1] - this.bounds.min[1];
		var dimz = this.bounds.max[2] - this.bounds.min[2];
		var maxdim = 1.0 / Math.max(Math.max(dimx,dimy),dimz);
		
		for(var i = 0; i < this.posData.length/4; i++){
			var ii = i*4;
			this.posData[ii+0] = (this.posData[ii+0] - centerx) * maxdim;
			this.posData[ii+1] = (this.posData[ii+1] - centery) * maxdim;
			this.posData[ii+2] = (this.posData[ii+2] - centerz) * maxdim;
		}
		
		this.bounds.min[0] = (this.bounds.min[0] - centerx) * maxdim;
		this.bounds.min[1] = (this.bounds.min[1] - centery) * maxdim;
		this.bounds.min[2] = (this.bounds.min[2] - centerz) * maxdim;
		this.bounds.max[0] = (this.bounds.max[0] - centerx) * maxdim;
		this.bounds.max[1] = (this.bounds.max[1] - centery) * maxdim;
		this.bounds.max[2] = (this.bounds.max[2] - centerz) * maxdim;
	}
	
	this.scale = function(s){
		for(var i = 0; i < this.posData.length/4; i++){
			var ii = i*4;
			this.posData[ii+0] *= s.x;
			this.posData[ii+1] *= s.y;
			this.posData[ii+2] *= s.z;
		}
		this.bounds.min[0] *= s.x;
		this.bounds.min[1] *= s.y;
		this.bounds.min[2] *= s.z;
		this.bounds.max[0] *= s.x;
		this.bounds.max[1] *= s.y;
		this.bounds.max[2] *= s.z;
	}
	
	this.translate = function(t){
		for(var i = 0; i < this.posData.length/4; i++){
			var ii = i*4;
			this.posData[ii+0] += t.x;
			this.posData[ii+1] += t.y;
			this.posData[ii+2] += t.z;
		}
		this.bounds.min[0] += t.x;
		this.bounds.min[1] += t.y;
		this.bounds.min[2] += t.z;
		this.bounds.max[0] += t.x;
		this.bounds.max[1] += t.y;
		this.bounds.max[2] += t.z;
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
	
	this.lookAt = function (eye,lookat,vup,fov,cols,rows){
		this.cols = cols;
		this.rows = rows;
		var aspect = cols / rows;
		this.height = 2.0*Math.tan(0.5*fov*Math.PI/180.0);
		this.width = this.height * aspect;
		
		this.eye = eye;
		
		this.W = eye.subtract(lookat);
		this.W.normalize();
		this.U = vup.cross(this.W);
		this.U.normalize();
		this.V = this.W.cross(this.U);
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
	
	this.toStr = function (){
		return "Camera\n\teye=" + this.eye.toStr() +
			"\n\tU=" + this.U.toStr() +
			"\n\tV=" + this.V.toStr() +
			"\n\tW=" + this.W.toStr() +
			"\n\twidth=" + this.width +
			"\n\theight=" + this.height +
			"\n\tcols=" + this.cols +
			" rows=" + this.rows;
	}
	
	this.defaultInit = function (){
		this.eye.x = this.eye.y = this.eye.z = 0.0;
		this.U.x=1.0; this.U.y=0.0; this.U.z=0.0; 
		this.V.x=0.0; this.V.y=1.0; this.V.z=0.0;
		this.W.x=0.0; this.W.y=0.0; this.W.z=1.0;
	}
}

function Light() {
	this.position = new Vec3();
	this.normal = new Vec3();
	this.T = new Vec3();
	this.B = new Vec3();
	this.irradiance = new Vec3();
	this.radius = 0.0;
	this.area = 0.0;
	
	this.set = function(position, normal, irradiance, radius){
		this.position = position;
		this.normal = normal;
		this.normal.normalize();
		this.irradiance = irradiance;
		this.radius = radius;
		this.calculateArea();
		this.calculateTBN();
	}
	
	this.calculateArea = function(){
		this.area = Math.PI * this.radius * this.radius;
	}
	
	this.calculateTBN = function(){
		var V = new Vec3();
		V.set(Math.abs(this.normal.x),Math.abs(this.normal.y),Math.abs(this.normal.z));
		var minmag = Math.min(V.x, V.y, V.z);
		if(minmag == V.x){
			V.setVec(this.normal);
			V.x = 1.0;
		}else if(minmag == V.y){
			V.setVec(this.normal);
			V.y = 1.0;
		}else{
			V.setVec(this.normal);
			V.z = 1.0;
		}
		V.normalize();
		this.T = V.cross(this.normal);
		this.T.normalize();
		this.B = this.normal.cross(this.T);
		this.B.normalize();
	}
	
	this.toShadowInfo = function(){
		return new Float32Array([
			this.position.x, this.position.y, this.position.z,
			this.T.x, this.T.y, this.T.z,
			this.B.x, this.B.y, this.B.z,
			this.radius,
			0.0, 0.0, 0.0, 0.0, 0.0, 0.0 // padding
			]); 
	}
	
	this.toSceneRenderInfo = function() {
		//console.log("Area=" + this.area);
		return new Float32Array([
			this.position.x, this.position.y, this.position.z,
			this.normal.x, this.normal.y, this.normal.z,
			this.irradiance.x, this.irradiance.y, this.irradiance.z,
			this.area,
			0.0, 0.0, 0.0, 0.0, 0.0, 0.0 // padding
			]); 
	}
	
	this.toLightRenderInfo = function() {
		return new Float32Array([
			this.position.x, this.position.y, this.position.z,
			this.normal.x, this.normal.y, this.normal.z,
			this.irradiance.x, this.irradiance.y, this.irradiance.z,
			this.radius,
			0.0, 0.0, 0.0, 0.0, 0.0, 0.0 // padding
			]); 
	}
}

/**************************************
* Global variables
**************************************/
var devices;
var sceneList=[
	"cornell.xml",
	"cornell_teapot.xml",
	"cornell_teapot2.xml",
	"cornell_teapot3.xml",
	"basic.xml",
	"basic2.xml",
	"twoLights.xml",
	"threeLights.xml",
	"triangles.xml",
	];
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
var cam = new Camera();
var width, height;
var canvasCtx;
var imgData;
var n_slabs = 1;
var rays_per_pixel = 1;
var focal_length = 7.0;
var lens_diameter = 1.5;
var scene;

// WebCL global variables
var cl_resources = [];
var device;
var ctx;
var cmdQueue;
var program;
var kernels = [];
var localWS = [];
var globalWS = [];
var dim = 2;
var buffers = [];
var passes = 1;
var goon = true;
	
/**************************************
* Function definitions
**************************************/
function main() {
	
	// Find WebCL devices.
	findWebCLDevices();
	
	// Add found devices to HTML device select element.
	var devicesSel = document.getElementById("ComputeDevices");
	var option;
	for(var i in devices){
		option = document.createElement("option");
		option.text=devices[i].getInfo(webcl.DEVICE_NAME);
		option.value = i;
		devicesSel.add(option,devicesSel.options[null]);
	}
	
	// Add scenes to HTML select element.
	fillSelect(document.getElementById("SceneSel"), sceneList);
	
	// Add controls to disable when rendering
	//controls.push(document.getElementById("Models"));
	
	// Get the width and height of the final image.
	var canvasElement = document.getElementById("canvasElement");
	width = Number(canvasElement.getAttribute("width"));
	height = Number(canvasElement.getAttribute("height"));
	
	// Create an image to write to.
	canvasCtx = canvasElement.getContext("2d");
	imgData = canvasCtx.createImageData(width,height);
	
	// Show default values on HTML
	//document.getElementById("NumberOfSlabs").value = n_slabs;
	document.getElementById("SRaysPerPixel").value = Math.sqrt(rays_per_pixel);
	updateRaysPerPixel();
	document.getElementById("FocalLength").value = focal_length;
	document.getElementById("LensDiameter").value = lens_diameter;
	
	updateScene();
}

function setMsg(msg){
	document.getElementById("demo").innerHTML = msg;
}

function findWebCLDevices(){
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
			for (var j in devs){
				if (devs[j].getInfo(webcl.DEVICE_TYPE) === webcl.DEVICE_TYPE_CPU){
					console.log("CPU device: " + devs[j].getInfo(webcl.DEVICE_NAME) );
				}else if (devs[j].getInfo(webcl.DEVICE_TYPE) === webcl.DEVICE_TYPE_GPU){
					console.log("GPU device: " + devs[j].getInfo(webcl.DEVICE_NAME) );
				}
				devices.push(devs[j]);
			}
		}
	} catch (e) {
		alert("Platform or device inquiry failed.\n"+"Error: "+e.toString());
		throw e;
	}
}

function fillSelect(sel,list){
	for(var i in list){
		var option = document.createElement("option");
		option.text = list[i];
		option.value = i;
		sel.add(option,sel.options[null]);
	}
}

function updateNSlabs(){
	n_slabs = Number(document.getElementById("NumberOfSlabs").value);
	if(isNaN(n_slabs)){
		n_slabs = 5;
		alert("Please enter a valid number of slabs\nbefore rendering.");
	}
	n_slabs = Math.floor(n_slabs);
	if (n_slabs <= 0){
		n_slabs = 1;
	}
	document.getElementById("NumberOfSlabs").value = n_slabs;
	console.log("n_slabs=" + n_slabs);
}

function updateRaysPerPixel(){
	var sqr_rays = Number(document.getElementById("SRaysPerPixel").value);
	if(isNaN(sqr_rays)){
		sqr_rays = 1;
		alert("Please enter a valid number of rays per pixel\nbefore rendering.");
	}
	sqr_rays = Math.floor(sqr_rays);
	if (sqr_rays <= 1){
		sqr_rays = 1;
	}
	rays_per_pixel = sqr_rays*sqr_rays;
	document.getElementById("SRaysPerPixel").value = sqr_rays;
	document.getElementById("RaysPerPixel").value = rays_per_pixel;
}

function updateFocalLength(){
	focal_length = Number(document.getElementById("FocalLength").value);
	if(isNaN(focal_length)){
		focal_length = 1;
		alert("Please enter a valid distance for focal length\nbefore rendering.");
	}
	document.getElementById("FocalLength").value = focal_length;
}

function updateLensDiameter(){
	lens_diameter = Number(document.getElementById("LensDiameter").value);
	if(isNaN(lens_diameter)){
		lens_diameter = 0.2;
		alert("Please enter a valid distance for focal length\nbefore rendering.");
	}
	document.getElementById("LensDiameter").value = lens_diameter;
}

function updateScene(){
	var sceneSel = document.getElementById("SceneSel");
	var sceneName = sceneList[sceneSel.selectedIndex];
	scene = loadScene("scenes/" + sceneName);
	focal_length = scene.focal_length;
	lens_diameter = scene.lens_diameter;
	document.getElementById("FocalLength").value = focal_length;
	document.getElementById("LensDiameter").value = lens_diameter;
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

function bounds2AABB(bounds){
	var array = new Float32Array(8);
	array[0] = bounds.min[0];
	array[1] = bounds.min[1];
	array[2] = bounds.min[2];
	array[3] = 1;
	array[4] = bounds.max[0];
	array[5] = bounds.max[1];
	array[6] = bounds.max[2];
	array[7] = 1;
	return array;
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

function createBoxMatrix(){
	var bm = [];
	for(var i = 0; i < n_slabs; i++){
		bm.push([]);
		for(var j = 0; j < n_slabs; j++){
			bm[i].push([]);
			for(var k = 0; k < n_slabs; k++){
				bm[i][j].push([]);
			}
		}
	}
	return bm;
}

function createBoxMatrixN(nslabs){
	var bm = [];
	for(var i = 0; i < nslabs; i++){
		bm.push([]);
		for(var j = 0; j < nslabs; j++){
			bm[i].push([]);
			for(var k = 0; k < nslabs; k++){
				bm[i][j].push([]);
			}
		}
	}
	return bm;
}

/******************************************************************************
 * New functions go here
******************************************************************************/

function parseXMLVec3(xml,name){
	var v = new Vec3();
	var elem = xml.getElementsByTagName(name)[0];
	v.x = Number(elem.getElementsByTagName("x")[0].childNodes[0].nodeValue);
	v.y = Number(elem.getElementsByTagName("y")[0].childNodes[0].nodeValue);
	v.z = Number(elem.getElementsByTagName("z")[0].childNodes[0].nodeValue);
	return v;
}

function parseXMLNum(xml,name){
	return Number(xml.getElementsByTagName(name)[0].childNodes[0].nodeValue);
}

function parseXMLStr(xml,name){
	return xml.getElementsByTagName(name)[0].childNodes[0].nodeValue;
}

function loadScene(sceneName){
	// Loading scene from XML file
	console.log("Loading scene: "+ sceneName);
	var xhttp=new XMLHttpRequest();
	xhttp.open("GET",sceneName,false);
	xhttp.send(null);
	var sceneDoc = xhttp.responseXML;
	
	// Parsing Scene
	var sceneBounds = new Bounds();
	
	// Read camera
	var cam = new Camera();
	var xmlcam = sceneDoc.getElementsByTagName("camera")[0];
	var xmleye = parseXMLVec3(xmlcam,"eye");
	var xmllookat = parseXMLVec3(xmlcam,"lookAt");
	var xmlvup = parseXMLVec3(xmlcam,"vup");
	var xmlfov = parseXMLNum(xmlcam,"fov");
	cam.lookAt(xmleye,xmllookat,xmlvup,xmlfov,width,height);
	var f = parseXMLNum(xmlcam,"focal_length");
	var ld = parseXMLNum(xmlcam,"lens_diameter");
	//console.log(cam.toStr());
	
	// Read Lights
	var lights = [];
	var xmllights = sceneDoc.getElementsByTagName("light");
	console.log("\tLights: " + xmllights.length);
	for(var i=0; i < xmllights.length; i++){
		var light = new Light();
		light.position = parseXMLVec3(xmllights[i],"position");
		light.normal = parseXMLVec3(xmllights[i],"normal");
		light.irradiance = parseXMLVec3(xmllights[i],"irradiance");
		light.radius = parseXMLNum(xmllights[i],"radius");
		light.calculateArea();
		light.calculateTBN();
		lights.push(light);
		//console.log("Light " + i + "\n\tpos=" + light.toStr());
	}
	
	// Read Materials
	var materials = [];
	var matLookUp = [];
	var mats = sceneDoc.getElementsByTagName("material");
	console.log("\tMaterials: " + mats.length);
	for(var i=0; i < mats.length; i++){
		// Get id and color from XML
		var id = parseXMLStr(mats[i],"id");
		var color = new Color();
		var xmlcolor = mats[i].getElementsByTagName("color")[0];
		color.r = parseXMLNum(xmlcolor,"r");
		color.g = parseXMLNum(xmlcolor,"g");
		color.b = parseXMLNum(xmlcolor,"b");
		color.a = parseXMLNum(xmlcolor,"a");
		
		// Save color and id
		materials.push(color);
		matLookUp[id] = i;
		
		//console.log("Material " + i + "\n\tid=" + id + " color=[" + color.r + "," + color.g + "," + color.b + "," + color.a + "]");
	}
	
	// Read geometry - Spheres
	var spheres = [];
	var sphereBounds = new Bounds();
	var xmlsph = sceneDoc.getElementsByTagName("sphere");
	console.log("\tSpheres: " + xmlsph.length);
	for(var i = 0; i < xmlsph.length; i++){
		var sphere = new Sphere();
		var xmlsphere = xmlsph[i];
		
		sphere.c = parseXMLVec3(xmlsphere,"center");
		sphere.r = parseXMLNum(xmlsphere,"radius");
		var mId = parseXMLStr(xmlsphere,"matId");
		sphere.matId = matLookUp[mId];
		
		// Update spheres bounds.
		sphereBounds.merge(sphere.bounds());
		
		// Save sphere
		spheres.push(sphere);
		
		//console.log("Sphere " + i + "\n\tc=[" + sphere.c.x + "," + sphere.c.y + "," + sphere.c.z + "] r=" + sphere.r + " matId=" + sphere.matId);
	}
	
	// Read geometry - Triangles
	var triangles = [];
	var triangleBounds = new Bounds();
	var xmltri = sceneDoc.getElementsByTagName("triangle");
	console.log("\tTriangles: " + xmltri.length);
	for(var i =0; i < xmltri.length; i++){
		var triangle = new Triangle();
		var xmltriangle = xmltri[i];
		triangle.p0 = parseXMLVec3(xmltriangle,"p0");
		triangle.p1 = parseXMLVec3(xmltriangle,"p1");
		triangle.p2 = parseXMLVec3(xmltriangle,"p2");
		triangle.n0 = parseXMLVec3(xmltriangle,"n0");
		triangle.n1 = parseXMLVec3(xmltriangle,"n1");
		triangle.n2 = parseXMLVec3(xmltriangle,"n2");
		var mId = parseXMLStr(xmltriangle,"matId");
		triangle.matId = matLookUp[mId];
		
		// Update triangles bounds.
		triangleBounds.merge(triangle.bounds());
		
		// Save triangle
		triangles.push(triangle);
		//console.log("Triangle " + i + 
		//	"\n\tp0=" + triangle.p0.toStr() + "\n\tp1=" + triangle.p1.toStr() + "\n\tp2=" + triangle.p2.toStr() + 
		//	"\n\tn0=" + triangle.n0.toStr() + "\n\tn1=" + triangle.n1.toStr() + "\n\tn2=" + triangle.n2.toStr() + 
		//	"\n\tmatId=" + triangle.matId);
	}
	// Check triangle bounds
	// if the triangles are axis aligned there is a chance that
	// the bounding box has zero volume (bad bad).
	for(var i = 0; i < 3; i++){
		if(triangleBounds.min[i] == triangleBounds.max[i]){
			triangleBounds.min[i] -= 0.1;
			triangleBounds.max[i] += 0.1;
		}
	}
	
	// Read geometry - Meshes
	var meshes = [];
	var meshBounds = new Bounds;
	var xmlmeshes = sceneDoc.getElementsByTagName("mesh");
	console.log("\tMeshes: " + xmlmeshes.length);
	for(var i =0; i < xmlmeshes.length; i++){
		
		var xmlmesh = xmlmeshes[i];
		var filemesh = parseXMLStr(xmlmesh,"file");
		var nslabs = parseXMLNum(xmlmesh,"nslabs");
		var normalize = parseXMLStr(xmlmesh,"normalize") == "yes";
		var scale = parseXMLVec3(xmlmesh,"scale");
		var translate = parseXMLVec3(xmlmesh,"translate");
		var mId = parseXMLStr(xmlmesh,"matId");
		var matId = matLookUp[mId];
		
		
		//console.log("\tMesh " + i + ": " + filemesh + ", " + matId);
		
		var jmesh = parseMeshJSON(filemesh);
		var mesh = new Mesh();
		mesh.loadFromJSON(jmesh,nslabs,matId);
		if(normalize) mesh.normalize();
		if(scale) mesh.scale(scale);
		if(translate) mesh.translate(translate);
		
		//console.log("\t\tTriangles: " + mesh.ntriangles);
		//console.log("\t\tPoints: " + mesh.posData.length / 4);
		//console.log("\t\tBounds: " + mesh.bounds.min + " - " + mesh.bounds.max);
		
		meshes.push(mesh);
		sceneBounds.merge(mesh.bounds);
	}
	
	// Merge bounds
	sceneBounds.merge(sphereBounds);
	sceneBounds.merge(triangleBounds);
	
	
	// Return scene
	return {
		camera:cam,
		focal_length: f,
		lens_diameter: ld,
		lights:lights,
		materials:materials, 
		bounds:sceneBounds, 
		spheres:spheres, 
		sphereBounds:sphereBounds,
		triangles:triangles,
		triangleBounds:triangleBounds,
		meshes:meshes
		};
}

function splitMeshData(meshData, posData, normalData, boxSizeData, nn_slabs){
	
	var x0,y0,z0,x1,y1,z1,x2,y2,z2;
	var bmin = new Vec3();
	bmin.x = meshData.bounds.min[0];
	bmin.y = meshData.bounds.min[1];
	bmin.z = meshData.bounds.min[2];
	var box_width = new Vec3();
	box_width.x = (meshData.bounds.max[0] - bmin.x) / nn_slabs;
	box_width.y = (meshData.bounds.max[1] - bmin.y) / nn_slabs;
	box_width.z = (meshData.bounds.max[2] - bmin.z) / nn_slabs;
	
	var box_pos = createBoxMatrixN(nn_slabs);
	var box_nor = createBoxMatrixN(nn_slabs);
	var box_idx = createBoxMatrixN(nn_slabs);
	
	// For each triangle in meshData
	var ps1 = 3*3; // triangle size in mesh data.
	for(var i = 0; i < meshData.nTriangles; i++){
		var pp1 = i*ps1;// Point position in mesh data.
		
		// Extract triangle positions
		x0 = meshData.positions[pp1+0];
		y0 = meshData.positions[pp1+1];
		z0 = meshData.positions[pp1+2];
		x1 = meshData.positions[pp1+3];
		y1 = meshData.positions[pp1+4];
		z1 = meshData.positions[pp1+5];
		x2 = meshData.positions[pp1+6];
		y2 = meshData.positions[pp1+7];
		z2 = meshData.positions[pp1+8];
		
		// Calculate boxes for triangle
		var tmin = new Vec3();
		var tmax = new Vec3();
		tmin.x = Math.min(Math.min(x0,x1),x2);
		tmin.y = Math.min(Math.min(y0,y1),y2);
		tmin.z = Math.min(Math.min(z0,z1),z2);
		tmax.x = Math.max(Math.max(x0,x1),x2);
		tmax.y = Math.max(Math.max(y0,y1),y2);
		tmax.z = Math.max(Math.max(z0,z1),z2);
		var min_box = new Vec3();
		var max_box = new Vec3();
		min_box.x = Math.floor( (tmin.x - bmin.x) / box_width.x );
		min_box.y = Math.floor( (tmin.y - bmin.y) / box_width.y );
		min_box.z = Math.floor( (tmin.z - bmin.z) / box_width.z );
		max_box.x = Math.floor( (tmax.x - bmin.x) / box_width.x );
		max_box.y = Math.floor( (tmax.y - bmin.y) / box_width.y );
		max_box.z = Math.floor( (tmax.z - bmin.z) / box_width.z );
		if(min_box.x < 0) min_box.x = 0;
		if(min_box.y < 0) min_box.y = 0;
		if(min_box.z < 0) min_box.z = 0;
		if(max_box.x >= nn_slabs) max_box.x = nn_slabs-1;
		if(max_box.y >= nn_slabs) max_box.y = nn_slabs-1;
		if(max_box.z >= nn_slabs) max_box.z = nn_slabs-1;
		
		// Add triangle to corresponding boxes
		for(var iz = min_box.z; iz <= max_box.z; iz++){
			for(var iy = min_box.y; iy <= max_box.y; iy++){
				for(var ix = min_box.x; ix <= max_box.x; ix++){
					// Add position
					box_pos[iz][iy][ix].push(x0);
					box_pos[iz][iy][ix].push(y0);
					box_pos[iz][iy][ix].push(z0);
					box_pos[iz][iy][ix].push(x1);
					box_pos[iz][iy][ix].push(y1);
					box_pos[iz][iy][ix].push(z1);
					box_pos[iz][iy][ix].push(x2);
					box_pos[iz][iy][ix].push(y2);
					box_pos[iz][iy][ix].push(z2);
					// Add normal
					box_nor[iz][iy][ix].push(meshData.normals[pp1+0]);
					box_nor[iz][iy][ix].push(meshData.normals[pp1+1]);
					box_nor[iz][iy][ix].push(meshData.normals[pp1+2]);
					box_nor[iz][iy][ix].push(meshData.normals[pp1+3]);
					box_nor[iz][iy][ix].push(meshData.normals[pp1+4]);
					box_nor[iz][iy][ix].push(meshData.normals[pp1+5]);
					box_nor[iz][iy][ix].push(meshData.normals[pp1+6]);
					box_nor[iz][iy][ix].push(meshData.normals[pp1+7]);
					box_nor[iz][iy][ix].push(meshData.normals[pp1+8]);
					// Add index
					box_idx[iz][iy][ix].push(meshData.materialIndices[i]);
				}
			}
		}
	}
	
	// Fill slab limits
	var slab_limits = [];
	slab_limits.push(0);
	var slab_total_size=0;
	for(var iz = 0; iz < nn_slabs; iz++){
		for(var iy = 0; iy < nn_slabs; iy++){
			for(var ix = 0; ix < nn_slabs; ix++){
				slab_total_size += box_idx[iz][iy][ix].length;
				slab_limits.push(slab_total_size);
			}
		}
	}
	
	// Push into data
	for(var i = 0; i < slab_limits.length; i++){
		boxSizeData.push(slab_limits[i]);
	}
	for(var iz = 0; iz < nn_slabs; iz++){
		for(var iy = 0; iy < nn_slabs; iy++){
			for(var ix = 0; ix < nn_slabs; ix++){
				// For each triangle in this box
				for(var k = 0; k < box_idx[iz][iy][ix].length; k++){
					var kk = k*9;
					// Add position
					posData.push(box_pos[iz][iy][ix][kk+0]);
					posData.push(box_pos[iz][iy][ix][kk+1]);
					posData.push(box_pos[iz][iy][ix][kk+2]);
					posData.push(0); // Padding
					posData.push(box_pos[iz][iy][ix][kk+3]);
					posData.push(box_pos[iz][iy][ix][kk+4]);
					posData.push(box_pos[iz][iy][ix][kk+5]);
					posData.push(0); // Padding
					posData.push(box_pos[iz][iy][ix][kk+6]);
					posData.push(box_pos[iz][iy][ix][kk+7]);
					posData.push(box_pos[iz][iy][ix][kk+8]);
					posData.push(0); // Padding
					// Add normal
					normalData.push(box_nor[iz][iy][ix][kk+0]);
					normalData.push(box_nor[iz][iy][ix][kk+1]);
					normalData.push(box_nor[iz][iy][ix][kk+2]);
					normalData.push(0); // Padding
					normalData.push(box_nor[iz][iy][ix][kk+3]);
					normalData.push(box_nor[iz][iy][ix][kk+4]);
					normalData.push(box_nor[iz][iy][ix][kk+5]);
					normalData.push(0); // Padding
					normalData.push(box_nor[iz][iy][ix][kk+6]);
					normalData.push(box_nor[iz][iy][ix][kk+7]);
					normalData.push(box_nor[iz][iy][ix][kk+8]);
					normalData.push(0); // Padding
					// Add index
					//indexData.push(box_idx[iz][iy][ix][k]);
				}
			}
		}
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

/**
 * Request size of some struct.
 */
function getStructSize(name){
	var sizeofKernel = program.createKernel("sizeof"+name);
	var sizeBuffer = ctx.createBuffer(webcl.MEM_WRITE_ONLY, 4);
	var sizeArray = new Uint32Array(1);
	sizeofKernel.setArg(0, sizeBuffer);
	cmdQueue.enqueueNDRangeKernel(sizeofKernel,1,null,[1],[1]);
	cmdQueue.enqueueReadBuffer(sizeBuffer,false,0,4,sizeArray,[]);
	cmdQueue.finish();
	sizeBuffer.release();
	sizeofKernel.release();
	var size = sizeArray[0];
	return size;
}

function prepareInitAcu(){
	
	// Create accumulation buffer
	var total_rays = rays_per_pixel * width * height;
	var acuBufferSize = total_rays * 4 * 4;
	buffers.acu = ctx.createBuffer(webcl.MEM_READ_WRITE, acuBufferSize);
	cl_resources.push(buffers.acu);
	
	// Create kernel to clear accu buffer
	var initAcuKernel = program.createKernel("initAcu");
	initAcuKernel.setArg(0, buffers.acu);
	initAcuKernel.setArg(1, new Uint32Array([total_rays]) );
	
	var localWS = getLocalWS(1,initAcuKernel,device);
	var globalWS = [
		Math.ceil(total_rays/localWS[0])*localWS[0] ];
		
	cmdQueue.enqueueNDRangeKernel(initAcuKernel,1,null,globalWS,localWS);
	cmdQueue.finish();
	
	initAcuKernel.release();
}

function prepareInitTrace(){
	// Request size of Ray struct
	var raySize = getStructSize("Ray");
	var poiSize = getStructSize("Poi");
	
	// Create kernel.
	var initTraceKernel = program.createKernel("initTrace");
	kernels.initTrace = initTraceKernel;
	cl_resources.push(initTraceKernel);
	
	// Create buffers.
	var total_rays = rays_per_pixel * width * height;
	//var acuBufferSize = total_rays * 4 * 4;
	var rayBufferSize = total_rays * raySize;
	var poiBufferSize = total_rays * poiSize;
	//buffers.acu = ctx.createBuffer(webcl.MEM_READ_WRITE, acuBufferSize);
	buffers.primaryRay = ctx.createBuffer(webcl.MEM_READ_WRITE, rayBufferSize);
	buffers.poi = ctx.createBuffer(webcl.MEM_READ_WRITE, poiBufferSize);
	//cl_resources.push(buffers.acu);
	cl_resources.push(buffers.primaryRay);
	cl_resources.push(buffers.poi);
	
	// Set kernel arguments.
	initTraceKernel.setArg(0, buffers.seeds);
	initTraceKernel.setArg(1, buffers.primaryRay);
	initTraceKernel.setArg(2, buffers.poi);
	initTraceKernel.setArg(3, bounds2AABB(scene.bounds));
	//initTraceKernel.setArg(4, cam.toFloat32Array() );
	initTraceKernel.setArg(5, new Float32Array([focal_length]) );
	initTraceKernel.setArg(6, new Float32Array([lens_diameter/2.0]) );
	initTraceKernel.setArg(7, new Uint32Array([rays_per_pixel]) );
	
	// Calculate local and global WS
	localWS.initTrace = getLocalWS(dim,initTraceKernel,device);
	globalWS.initTrace = [
		Math.ceil(width/localWS.initTrace[0])*localWS.initTrace[0], 
		Math.ceil(height/localWS.initTrace[1])*localWS.initTrace[1]];
}

function prepareInitSeeds(){
	// Prepare seeds
	var total_rays = rays_per_pixel * width * height;
	var seedArray = new Int32Array(total_rays);
	for(var i = 0; i < total_rays; i++){
		seedArray[i] = 1 + Math.floor(Math.random() * 2147483647);
	}
	
	// Create buffers
	buffers.seeds = ctx.createBuffer(webcl.MEM_READ_WRITE, seedArray.byteLength);
	cl_resources.push(buffers.seeds);
	
	// Send data to OpenCL device
	cmdQueue.enqueueWriteBuffer(buffers.seeds, false, 0, seedArray.byteLength, seedArray, []);
}

function prepareSphereTrace(){
	// Create kernel.
	kernels.sphereTrace = program.createKernel("sphereTrace");
	cl_resources.push(kernels.sphereTrace);
	
	// Transform sphere data into arrays
	var sphereData = [];
	var smatIdData = [];
	var boxSizeData = [];
	splitSphereData(scene, sphereData, smatIdData, boxSizeData);
	var sphereArray = new Float32Array(sphereData);
	var smatIdArray = new Uint32Array(smatIdData);
	var sboxSizeArray = new Uint32Array(boxSizeData);
	
	//console.log("sphereArray.length="+sphereArray.length);
	//console.log("smatIdArray.length="+smatIdArray.length);
	//console.log("sboxSizeArray.length="+sboxSizeArray.length);
	
	// Create buffers
	buffers.sphere = ctx.createBuffer(webcl.MEM_READ_ONLY, sphereArray.byteLength);
	buffers.s_matId = ctx.createBuffer(webcl.MEM_READ_ONLY, smatIdArray.byteLength);
	buffers.s_boxSize = ctx.createBuffer(webcl.MEM_READ_ONLY, sboxSizeArray.byteLength);
	cl_resources.push(buffers.sphere);
	cl_resources.push(buffers.s_matId);
	cl_resources.push(buffers.s_boxSize);
	
	// Send data to OpenCL device
	cmdQueue.enqueueWriteBuffer(buffers.sphere, false, 0, sphereArray.byteLength, sphereArray, []);
	cmdQueue.enqueueWriteBuffer(buffers.s_matId, false, 0, smatIdArray.byteLength, smatIdArray, []);
	cmdQueue.enqueueWriteBuffer(buffers.s_boxSize, false, 0, sboxSizeArray.byteLength, sboxSizeArray, []);
	
	// Set kernel arguments.
	var total_rays = rays_per_pixel * width * height;
	kernels.sphereTrace.setArg(0, new Uint32Array([total_rays]) );
	kernels.sphereTrace.setArg(1, buffers.poi);
	kernels.sphereTrace.setArg(2, buffers.primaryRay);
	kernels.sphereTrace.setArg(3, buffers.sphere);
	kernels.sphereTrace.setArg(4, buffers.s_matId);
	kernels.sphereTrace.setArg(5, buffers.s_boxSize);
	kernels.sphereTrace.setArg(6, bounds2AABB(scene.sphereBounds) );
	kernels.sphereTrace.setArg(7, new Uint32Array([n_slabs]) );
	
	// Compute local and global WS
	localWS.sphereTrace = getLocalWS(1,kernels.sphereTrace,device);
	globalWS.sphereTrace = [
		Math.ceil(total_rays/localWS.sphereTrace[0])*localWS.sphereTrace[0] ];
}

function prepareTriangleTrace(){
	// Create kernel
	kernels.triangleTrace = program.createKernel("triangleTrace");
	cl_resources.push(kernels.triangleTrace);
	
	// Transform data into arrays
	var posData = [];
	var normalData = [];
	var matidData = [];
	var tboxSizeData = [];
	splitTriangleData(scene,posData,normalData,matidData,tboxSizeData);
	var posArray = new Float32Array(posData);
	var normalArray = new Float32Array(normalData);
	var matidArray = new Uint32Array(matidData);
	var tboxSizeArray = new Uint32Array(tboxSizeData);
	
	// Create buffers.
	buffers.t_pos = ctx.createBuffer(webcl.MEM_READ_ONLY, posArray.byteLength);
	buffers.t_normal = ctx.createBuffer(webcl.MEM_READ_ONLY, normalArray.byteLength);
	buffers.t_matid = ctx.createBuffer(webcl.MEM_READ_ONLY, matidArray.byteLength);
	buffers.t_box_size = ctx.createBuffer(webcl.MEM_READ_ONLY, tboxSizeArray.byteLength);
	cl_resources.push(buffers.t_pos);
	cl_resources.push(buffers.t_normal);
	cl_resources.push(buffers.t_matid);
	cl_resources.push(buffers.t_box_size);
	
	// Send data to OpenCL device
	cmdQueue.enqueueWriteBuffer(buffers.t_pos, false, 0, posArray.byteLength, posArray, []);
	cmdQueue.enqueueWriteBuffer(buffers.t_normal, false, 0, normalArray.byteLength, normalArray, []);
	cmdQueue.enqueueWriteBuffer(buffers.t_matid, false, 0, matidArray.byteLength, matidArray, []);
	cmdQueue.enqueueWriteBuffer(buffers.t_box_size, false, 0, tboxSizeArray.byteLength, tboxSizeArray, []);
	
	// Set kernel arguments
	var total_rays = rays_per_pixel * width * height;
	kernels.triangleTrace.setArg(0, new Uint32Array([total_rays]) );
	kernels.triangleTrace.setArg(1, buffers.poi);
	kernels.triangleTrace.setArg(2, buffers.primaryRay);
	kernels.triangleTrace.setArg(3, buffers.t_pos);
	kernels.triangleTrace.setArg(4, buffers.t_normal);
	kernels.triangleTrace.setArg(5, buffers.t_matid);
	kernels.triangleTrace.setArg(6, buffers.t_box_size);
	kernels.triangleTrace.setArg(7, bounds2AABB(scene.triangleBounds) );
	kernels.triangleTrace.setArg(8, new Uint32Array([n_slabs]) );
	
	// Compute local and global WS
	localWS.triangleTrace = getLocalWS(1,kernels.triangleTrace,device);
	globalWS.triangleTrace = [
		Math.ceil(total_rays/localWS.triangleTrace[0])*localWS.triangleTrace[0] ];
}

function prepareMeshTrace(){
	// Create kernel
	kernels.meshTrace = program.createKernel("meshTrace");
	cl_resources.push(kernels.meshTrace);
	
	for(var i = 0; i < scene.meshes.length; i++){
		var mesh = scene.meshes[i];
		
		// Transform data into arrays
		var posArray = new Float32Array(mesh.posData);
		var normalArray = new Float32Array(mesh.normalData);
		var boxSizeArray = new Uint32Array(mesh.boxSizeData);
		
		// Create buffers.
		mesh.posBuffer = ctx.createBuffer(webcl.MEM_READ_ONLY, posArray.byteLength);
		mesh.normalBuffer = ctx.createBuffer(webcl.MEM_READ_ONLY, normalArray.byteLength);
		mesh.boxSizeBuffer = ctx.createBuffer(webcl.MEM_READ_ONLY, boxSizeArray.byteLength);
		cl_resources.push(mesh.posBuffer);
		cl_resources.push(mesh.normalBuffer);
		cl_resources.push(mesh.boxSizeBuffer);
		
		// Send data to OpenCL device
		cmdQueue.enqueueWriteBuffer(mesh.posBuffer, false, 0, posArray.byteLength, posArray, []);
		cmdQueue.enqueueWriteBuffer(mesh.normalBuffer, false, 0, normalArray.byteLength, normalArray, []);
		cmdQueue.enqueueWriteBuffer(mesh.boxSizeBuffer, false, 0, boxSizeArray.byteLength, boxSizeArray, []);
	}
	
	// Set kernel arguments
	var total_rays = rays_per_pixel * width * height;
	kernels.meshTrace.setArg(0, new Uint32Array([total_rays]) );
	kernels.meshTrace.setArg(1, buffers.poi );
	kernels.meshTrace.setArg(2, buffers.primaryRay);
	
	// Compute local and global WS
	localWS.meshTrace = getLocalWS(1,kernels.meshTrace,device);
	globalWS.meshTrace = [
		Math.ceil(total_rays/localWS.meshTrace[0])*localWS.meshTrace[0] ];
}

function executeMeshTrace(mesh){
	// Set specific kernel arguments
	kernels.meshTrace.setArg(3, mesh.posBuffer);
	kernels.meshTrace.setArg(4, mesh.normalBuffer);
	kernels.meshTrace.setArg(5, mesh.boxSizeBuffer);
	kernels.meshTrace.setArg(6, new Uint32Array([mesh.matId]) );
	kernels.meshTrace.setArg(7, bounds2AABB(mesh.bounds) );
	kernels.meshTrace.setArg(8, new Uint32Array([mesh.nslabs]) );
	
	cmdQueue.enqueueNDRangeKernel(kernels.meshTrace,1,null,globalWS.meshTrace,localWS.meshTrace);
}

function prepareCopyToPixel(){
	// Create kernel.
	kernels.copyToPixel = program.createKernel("copyToPixel");
	cl_resources.push(kernels.copyToPixel);
	
	// Create buffers
	var pixelBufferSize = width * height * 4;
	buffers.pixel = ctx.createBuffer(webcl.MEM_WRITE_ONLY, pixelBufferSize);
	cl_resources.push(buffers.pixel);
	
	// Set kernel arguments
	kernels.copyToPixel.setArg(0, buffers.pixel);
	kernels.copyToPixel.setArg(1, buffers.acu);
	//kernels.copyToPixel.setArg(2, new Float32Array([1.0]) );
	kernels.copyToPixel.setArg(3, new Uint32Array([width * height]) );
	kernels.copyToPixel.setArg(4, new Uint32Array([rays_per_pixel]) );
	
	// Calculate local and global WS
	localWS.copyToPixel = getLocalWS(1,kernels.copyToPixel,device);
	globalWS.copyToPixel = 
		[Math.ceil((width*height)/localWS.copyToPixel[0])*localWS.copyToPixel[0]];
}

function executeInitTrace(){
	kernels.initTrace.setArg(4, cam.toFloat32Array() );
	cmdQueue.enqueueNDRangeKernel(kernels.initTrace,dim,null,globalWS.initTrace,localWS.initTrace);
}

function executeInitSeeds(){
	cmdQueue.enqueueNDRangeKernel(kernels.initSeeds,1,null,globalWS.initSeeds,localWS.initSeeds);
}

function executeSphereTrace(){	
	// cmdQueue.enqueueNDRangeKernel(kernels.sphereTrace,dim,null,[160,120],[1,1]);
	cmdQueue.enqueueNDRangeKernel(kernels.sphereTrace,1,null,globalWS.sphereTrace,localWS.sphereTrace);
}

function executeTriangleTrace(){	
	cmdQueue.enqueueNDRangeKernel(kernels.triangleTrace,1,null,globalWS.triangleTrace,localWS.triangleTrace);	
}

function prepareLightRender(){
	// Create kernel
	kernels.lightRender = program.createKernel("lightRender");
	cl_resources.push(kernels.lightRender);
	
	// Set kernel arguments
	var total_rays = width*height*rays_per_pixel;
	kernels.lightRender.setArg(0, buffers.poi);
	kernels.lightRender.setArg(1, buffers.primaryRay);
	kernels.lightRender.setArg(2, buffers.acu);
	kernels.lightRender.setArg(4, new Uint32Array([total_rays]) );
	
	// Calculate local and global WS
	localWS.lightRender = getLocalWS(1, kernels.lightRender, device);
	globalWS.lightRender = [
		Math.ceil((total_rays)/localWS.lightRender[0])*localWS.lightRender[0] ];
}

function prepareSceneRender(){
	// Create kernel.
	kernels.sceneRender = program.createKernel("sceneRender");
	cl_resources.push(kernels.sceneRender);
	
	// Transform materials into array.
	var materialData = [];
	splitMaterialData(scene,materialData);
	var materialArray = new Float32Array(materialData);
	
	// Create buffers
	buffers.material = ctx.createBuffer(webcl.MEM_READ_ONLY, materialArray.byteLength);
	cl_resources.push(buffers.material);
	
	// Send data to OpenCL device
	cmdQueue.enqueueWriteBuffer(buffers.material, false, 0, materialArray.byteLength, materialArray, []);
	
	// Set kernel arguments
	var total_rays = width*height*rays_per_pixel;
	kernels.sceneRender.setArg(0,buffers.acu);
	kernels.sceneRender.setArg(1,buffers.poi);
	kernels.sceneRender.setArg(2,buffers.shadow);
	kernels.sceneRender.setArg(3,buffers.material);
	kernels.sceneRender.setArg(5,new Uint32Array([total_rays]) );
	
	// Calculate local and global WS
	localWS.sceneRender = getLocalWS(1, kernels.sceneRender, device);
	globalWS.sceneRender = 
		[Math.ceil((total_rays)/localWS.sceneRender[0])*localWS.sceneRender[0]];
	//console.log("LocalWS=" + localWS.sceneRender);
	//console.log("GlobalWS=" + globalWS.sceneRender);
}

function executeLightRender(light){ 
	kernels.lightRender.setArg(3, light.toLightRenderInfo() );
	cmdQueue.enqueueNDRangeKernel(kernels.lightRender,1,null,globalWS.lightRender,localWS.lightRender);
}

function executeSceneRender(light){ 
	//cmdQueue.enqueueNDRangeKernel(kernels.sceneRender,1,null,[76800],[1]);
	kernels.sceneRender.setArg(4, light.toSceneRenderInfo() );
	cmdQueue.enqueueNDRangeKernel(kernels.sceneRender,1,null,globalWS.sceneRender,localWS.sceneRender);
	cmdQueue.finish();
	//kernels.sceneRender.release();
}

function executeCopyToPixel(n_lights){
	//console.log("copyToPixel() globalWS="+globalWS.copyToPixel[0]+ " localWS="+localWS.copyToPixel[0]);
	var div = 1.0 / (rays_per_pixel * n_lights);
	kernels.copyToPixel.setArg(2, new Float32Array([div]) );
	cmdQueue.enqueueNDRangeKernel(kernels.copyToPixel,1,null,globalWS.copyToPixel,localWS.copyToPixel);
}

function prepareInitShadowTrace(){
	// Request size of Ray struct
	var raySize = getStructSize("Ray");
	
	// Create kernel
	kernels.initShadowTrace = program.createKernel("initShadowTrace");
	cl_resources.push(kernels.initShadowTrace);
	
	// Create buffers
	var total_rays = rays_per_pixel * width * height;
	var rayBufferSize = total_rays * raySize;
	buffers.shadow = ctx.createBuffer(webcl.MEM_READ_WRITE, rayBufferSize);
	cl_resources.push(buffers.shadow);
	
	// Set kernel arguments.
	kernels.initShadowTrace.setArg(0,buffers.shadow);
	kernels.initShadowTrace.setArg(1,buffers.poi);
	kernels.initShadowTrace.setArg(2,new Uint32Array([total_rays]) );
	//kernels.initShadowTrace.setArg(3, light.toFloat32Array() );
	kernels.initShadowTrace.setArg(4,buffers.seeds);
	
	// Calculate local and global WS
	localWS.initShadowTrace = getLocalWS(1,kernels.initShadowTrace,device);
	globalWS.initShadowTrace = [
		Math.ceil(total_rays/localWS.initShadowTrace[0])*localWS.initShadowTrace[0] ];
}

function prepareBouncePaths(){
	// Create kernel
	kernels.bouncePaths = program.createKernel("bouncePaths");
	
	// Set kernel args
	var total_rays = rays_per_pixel * width * height;
	kernels.bouncePaths.setArg(0, buffers.poi);
	kernels.bouncePaths.setArg(1, buffers.primaryRay);
	kernels.bouncePaths.setArg(2, buffers.seeds);
	kernels.bouncePaths.setArg(3,new Uint32Array([total_rays]) );
	
	// Calculate local and global WS
	localWS.bouncePaths = getLocalWS(1, kernels.bouncePaths, device);
	globalWS.bouncePaths = [
		Math.ceil(total_rays/localWS.bouncePaths[0])*localWS.bouncePaths[0] ];
}

function prepareSphereShadowTrace(){
	// Create kernel
	kernels.sphereShadowTrace = program.createKernel("sphereShadowTrace");
	cl_resources.push(kernels.sphereShadowTrace);
	
	// Set kernel arguments.
	var total_rays = rays_per_pixel * width * height;
	kernels.sphereShadowTrace.setArg(0, new Uint32Array([total_rays]) );
	kernels.sphereShadowTrace.setArg(1, buffers.shadow);
	kernels.sphereShadowTrace.setArg(2, buffers.sphere);
	kernels.sphereShadowTrace.setArg(3, buffers.s_boxSize);
	kernels.sphereShadowTrace.setArg(4, bounds2AABB(scene.sphereBounds));
	kernels.sphereShadowTrace.setArg(5, new Uint32Array([n_slabs]) );
	
	// Compute local and global WS
	localWS.sphereShadowTrace = getLocalWS(1,kernels.sphereShadowTrace,device);
	globalWS.sphereShadowTrace = [
		Math.ceil(total_rays/localWS.sphereShadowTrace[0])*localWS.sphereShadowTrace[0] ];
}

function prepareTriangleShadowTrace(){
	// Create kernel
	kernels.triangleShadowTrace = program.createKernel("triangleShadowTrace");
	cl_resources.push(kernels.triangleShadowTrace);
	
	// Set kernel arguments.
	var total_rays = rays_per_pixel * width * height;
	kernels.triangleShadowTrace.setArg(0, new Uint32Array([total_rays]) );
	kernels.triangleShadowTrace.setArg(1, buffers.shadow);
	// kernels.triangleShadowTrace.setArg(2, buffers.t_pos);
	// kernels.triangleShadowTrace.setArg(3, buffers.t_box_size);
	// kernels.triangleShadowTrace.setArg(4, bounds2AABB(scene.triangleBounds));
	// kernels.triangleShadowTrace.setArg(5, new Uint32Array([n_slabs]) );
	
	// Compute local and global WS
	localWS.triangleShadowTrace = getLocalWS(1,kernels.triangleShadowTrace,device);
	globalWS.triangleShadowTrace = [
		Math.ceil(total_rays/localWS.triangleShadowTrace[0])*localWS.triangleShadowTrace[0] ];
}

function executeInitShadowTrace(light){
	kernels.initShadowTrace.setArg(3, light.toShadowInfo() );
	cmdQueue.enqueueNDRangeKernel(kernels.initShadowTrace,1,null,globalWS.initShadowTrace,localWS.initShadowTrace);
}

function executeBouncePaths(){
	cmdQueue.enqueueNDRangeKernel(kernels.bouncePaths,1,null,globalWS.bouncePaths,localWS.bouncePaths);
}

function executeSphereShadowTrace(){
	cmdQueue.enqueueNDRangeKernel(kernels.sphereShadowTrace,1,null,globalWS.sphereShadowTrace,localWS.sphereShadowTrace);
}

function executeTriangleShadowTrace(){
	kernels.triangleShadowTrace.setArg(2, buffers.t_pos);
	kernels.triangleShadowTrace.setArg(3, buffers.t_box_size);
	kernels.triangleShadowTrace.setArg(4, bounds2AABB(scene.triangleBounds));
	kernels.triangleShadowTrace.setArg(5, new Uint32Array([n_slabs]) );
	cmdQueue.enqueueNDRangeKernel(kernels.triangleShadowTrace,1,null,globalWS.triangleShadowTrace,localWS.triangleShadowTrace);
}

function executeMeshShadowTrace(mesh){
	kernels.triangleShadowTrace.setArg(2, mesh.posBuffer);
	kernels.triangleShadowTrace.setArg(3, mesh.boxSizeBuffer);
	kernels.triangleShadowTrace.setArg(4, bounds2AABB(mesh.bounds));
	kernels.triangleShadowTrace.setArg(5, new Uint32Array([mesh.nslabs]) );
	cmdQueue.enqueueNDRangeKernel(kernels.triangleShadowTrace,1,null,globalWS.triangleShadowTrace,localWS.triangleShadowTrace);
}

function sendImagetoHTML(){
	// Read pixel data back from device
	cmdQueue.enqueueReadBuffer(buffers.pixel,false,0,imgData.data.length,imgData.data,[]);
	cmdQueue.finish();
	
	// Send img data to HTML.
	canvasCtx.putImageData(imgData, 0,0);
}

function releaseCLResources(){
	var i = 0;
	while(cl_resources.length > 0){
		var res = cl_resources.pop();
		res.release();
		i++;
	}
	console.log("WebCL: " + i + " resources released.");
	kernels = [];
	localWS = [];
	globalWS = [];
	buffers = [];
	passes = 1;
}

function splitSphereData(scene, sphereData, smatIdData, boxSizeData){
	var cx,cy,cz,rad,index;
	var bmin = new Vec3();
	bmin.x = scene.sphereBounds.min[0];
	bmin.y = scene.sphereBounds.min[1];
	bmin.z = scene.sphereBounds.min[2];
	var box_width = new Vec3();
	box_width.x = (scene.sphereBounds.max[0] - bmin.x) / n_slabs;
	box_width.y = (scene.sphereBounds.max[1] - bmin.y) / n_slabs;
	box_width.z = (scene.sphereBounds.max[2] - bmin.z) / n_slabs;
	
	// Build matrix of boxes
	var box_pos = createBoxMatrix();
	var box_idx = createBoxMatrix();
	
	// For each sphere scene
	//console.log("scene.spheres.length=" + scene.spheres.length);
	for(var i = 0; i < scene.spheres.length; i++){
		var s = scene.spheres[i];
		// Extract sphere info
		var matId = s.matId;
		var c = s.c;
		var rad = s.r;
		
		// Calculate boxes for this sphere
		var min_slab = new Vec3();
		var max_slab = new Vec3();
		min_slab.x = Math.floor( (c.x - rad - bmin.x) / box_width.x );
		min_slab.y = Math.floor( (c.y - rad - bmin.y) / box_width.y );
		min_slab.z = Math.floor( (c.z - rad - bmin.z) / box_width.z );
		max_slab.x = Math.floor( (c.x + rad - bmin.x) / box_width.x );
		max_slab.y = Math.floor( (c.y + rad - bmin.y) / box_width.y );
		max_slab.z = Math.floor( (c.z + rad - bmin.z) / box_width.z );
		if(min_slab.x < 0) min_slab.x = 0;
		if(min_slab.y < 0) min_slab.y = 0;
		if(min_slab.z < 0) min_slab.z = 0;
		if(max_slab.x >= n_slabs) max_slab.x = n_slabs-1;
		if(max_slab.y >= n_slabs) max_slab.y = n_slabs-1;
		if(max_slab.z >= n_slabs) max_slab.z = n_slabs-1;
		
		// Add sphere into boxes
		for(var iz = min_slab.z; iz <= max_slab.z; iz++){
			for(var iy = min_slab.y; iy <= max_slab.y; iy++){
				for(var ix = min_slab.x; ix <= max_slab.x; ix++){
					//console.log("iz="+iz+" iy="+iy+" ix="+ix);
					box_pos[iz][iy][ix].push(c.x);
					box_pos[iz][iy][ix].push(c.y);
					box_pos[iz][iy][ix].push(c.z);
					box_pos[iz][iy][ix].push(rad*rad);
					box_idx[iz][iy][ix].push(matId);
				}
			}
		}
	}
	
	// Fill slab limits
	var slab_limits = [];
	slab_limits.push(0);
	var slab_total_size=0;
	for(var iz = 0; iz < n_slabs; iz++){
		for(var iy = 0; iy < n_slabs; iy++){
			for(var ix = 0; ix < n_slabs; ix++){
				slab_total_size += box_idx[iz][iy][ix].length;
				slab_limits.push(slab_total_size);
			}
		}
	}
	
	// Push into data
	for(var i = 0; i < slab_limits.length; i++){
		boxSizeData.push(slab_limits[i]);
	}
	for(var iz = 0; iz < n_slabs; iz++){
		for(var iy = 0; iy < n_slabs; iy++){
			for(var ix = 0; ix < n_slabs; ix++){
				// For each sphere in this box
				for(var k = 0; k < box_idx[iz][iy][ix].length; k++){
					var kk = k*4;
					sphereData.push(box_pos[iz][iy][ix][kk]);
					sphereData.push(box_pos[iz][iy][ix][kk+1]);
					sphereData.push(box_pos[iz][iy][ix][kk+2]);
					sphereData.push(box_pos[iz][iy][ix][kk+3]);
					smatIdData.push(box_idx[iz][iy][ix][k]);
				}
			}
		}
	}
}

function splitTriangleData(scene, posData, normalData, matidData, tboxSizeData){
	var cx,cy,cz,rad,index;
	var bmin = new Vec3();
	bmin.x = scene.triangleBounds.min[0];
	bmin.y = scene.triangleBounds.min[1];
	bmin.z = scene.triangleBounds.min[2];
	var box_width = new Vec3();
	box_width.x = (scene.triangleBounds.max[0] - bmin.x) / n_slabs;
	box_width.y = (scene.triangleBounds.max[1] - bmin.y) / n_slabs;
	box_width.z = (scene.triangleBounds.max[2] - bmin.z) / n_slabs;
	
	var box_pos = createBoxMatrix();
	var box_nor = createBoxMatrix();
	var box_idx = createBoxMatrix();
	
	// For each triangle in meshData
	for(var i = 0; i < scene.triangles.length; i++){
		var tri = scene.triangles[i];
		var triangle = tri;
		
		// Calculate boxes for triangle
		var tbounds = tri.bounds();
		//console.log("bounds.min=" + tbounds.min);
		//console.log("bounds.max=" + tbounds.max);
		var min_box = new Vec3();
		var max_box = new Vec3();
		min_box.x = Math.floor( (tbounds.min[0] - bmin.x) / box_width.x );
		min_box.y = Math.floor( (tbounds.min[1] - bmin.y) / box_width.y );
		min_box.z = Math.floor( (tbounds.min[2] - bmin.z) / box_width.z );
		max_box.x = Math.floor( (tbounds.max[0] - bmin.x) / box_width.x );
		max_box.y = Math.floor( (tbounds.max[1] - bmin.y) / box_width.y );
		max_box.z = Math.floor( (tbounds.max[2] - bmin.z) / box_width.z );
		if(min_box.x < 0) min_box.x = 0;
		if(min_box.y < 0) min_box.y = 0;
		if(min_box.z < 0) min_box.z = 0;
		if(max_box.x >= n_slabs) max_box.x = n_slabs-1;
		if(max_box.y >= n_slabs) max_box.y = n_slabs-1;
		if(max_box.z >= n_slabs) max_box.z = n_slabs-1;
		
		//console.log("Triangle " + i);
		//console.log("\t min_box=" + min_box.toStr() );
		//console.log("\t max_box=" + max_box.toStr() );
		
		// Add triangle to corresponding boxes
		for(var iz = min_box.z; iz <= max_box.z; iz++){
			for(var iy = min_box.y; iy <= max_box.y; iy++){
				for(var ix = min_box.x; ix <= max_box.x; ix++){
					// Add position
					box_pos[iz][iy][ix].push(tri.p0.x);
					box_pos[iz][iy][ix].push(tri.p0.y);
					box_pos[iz][iy][ix].push(tri.p0.z);
					box_pos[iz][iy][ix].push(tri.p1.x);
					box_pos[iz][iy][ix].push(tri.p1.y);
					box_pos[iz][iy][ix].push(tri.p1.z);
					box_pos[iz][iy][ix].push(tri.p2.x);
					box_pos[iz][iy][ix].push(tri.p2.y);
					box_pos[iz][iy][ix].push(tri.p2.z);
					// Add normal
					box_nor[iz][iy][ix].push(tri.n0.x);
					box_nor[iz][iy][ix].push(tri.n0.y);
					box_nor[iz][iy][ix].push(tri.n0.z);
					box_nor[iz][iy][ix].push(tri.n1.x);
					box_nor[iz][iy][ix].push(tri.n1.y);
					box_nor[iz][iy][ix].push(tri.n1.z);
					box_nor[iz][iy][ix].push(tri.n2.x);
					box_nor[iz][iy][ix].push(tri.n2.y);
					box_nor[iz][iy][ix].push(tri.n2.z);
					// Add index
					box_idx[iz][iy][ix].push(tri.matId);
				}
			}
		}
	}
	
	// Fill slab limits
	var slab_limits = [];
	slab_limits.push(0);
	var slab_total_size=0;
	for(var iz = 0; iz < n_slabs; iz++){
		for(var iy = 0; iy < n_slabs; iy++){
			for(var ix = 0; ix < n_slabs; ix++){
				slab_total_size += box_idx[iz][iy][ix].length;
				slab_limits.push(slab_total_size);
			}
		}
	}
	
	// Push into data
	for(var i = 0; i < slab_limits.length; i++){
		tboxSizeData.push(slab_limits[i]);
	}
	for(var iz = 0; iz < n_slabs; iz++){
		for(var iy = 0; iy < n_slabs; iy++){
			for(var ix = 0; ix < n_slabs; ix++){
				// For each triangle in this box
				for(var k = 0; k < box_idx[iz][iy][ix].length; k++){
					var kk = k*9;
					// Add position
					posData.push(box_pos[iz][iy][ix][kk+0]);
					posData.push(box_pos[iz][iy][ix][kk+1]);
					posData.push(box_pos[iz][iy][ix][kk+2]);
					posData.push(0); // Padding
					posData.push(box_pos[iz][iy][ix][kk+3]);
					posData.push(box_pos[iz][iy][ix][kk+4]);
					posData.push(box_pos[iz][iy][ix][kk+5]);
					posData.push(0); // Padding
					posData.push(box_pos[iz][iy][ix][kk+6]);
					posData.push(box_pos[iz][iy][ix][kk+7]);
					posData.push(box_pos[iz][iy][ix][kk+8]);
					posData.push(0); // Padding
					// Add normal
					normalData.push(box_nor[iz][iy][ix][kk+0]);
					normalData.push(box_nor[iz][iy][ix][kk+1]);
					normalData.push(box_nor[iz][iy][ix][kk+2]);
					normalData.push(0); // Padding
					normalData.push(box_nor[iz][iy][ix][kk+3]);
					normalData.push(box_nor[iz][iy][ix][kk+4]);
					normalData.push(box_nor[iz][iy][ix][kk+5]);
					normalData.push(0); // Padding
					normalData.push(box_nor[iz][iy][ix][kk+6]);
					normalData.push(box_nor[iz][iy][ix][kk+7]);
					normalData.push(box_nor[iz][iy][ix][kk+8]);
					normalData.push(0); // Padding
					// Add index
					matidData.push(box_idx[iz][iy][ix][k]);
				}
			}
		}
	}
}

function splitMaterialData(scene, materialData){
	for(var i in scene.materials){
		var color = scene.materials[i];
		materialData.push(color.r);
		materialData.push(color.g);
		materialData.push(color.b);
		materialData.push(color.a);
	}
}

function preRender(){
	cam = scene.camera;
	
	// Init OpenCL context.
	createCLBasicResources();
	
	// Prepare kernels
	prepareInitAcu();
	prepareInitSeeds();
	prepareInitTrace(scene.bounds);
	if (scene.spheres.length > 0) prepareSphereTrace();
	if (scene.triangles.length > 0) prepareTriangleTrace();
	if (scene.meshes.length > 0) prepareMeshTrace();
	prepareInitShadowTrace();
	if (scene.spheres.length > 0) prepareSphereShadowTrace();
	if (scene.triangles.length > 0 || scene.meshes.length > 0) prepareTriangleShadowTrace();
	prepareSceneRender();
	prepareCopyToPixel();
	prepareBouncePaths();
	prepareLightRender();
}

function executeRender(){
	// Execute kernels
	executeInitTrace();
	if (scene.spheres.length > 0) executeSphereTrace(); 
	if (scene.triangles.length > 0) executeTriangleTrace();
	for (var i in scene.meshes){
		executeMeshTrace(scene.meshes[i]);
	}
	for(var i in scene.lights){ 
		executeLightRender(scene.lights[i]);
	}
	for(var i in scene.lights){
		// We trace shadows for each light in scene
		executeInitShadowTrace(scene.lights[i]);
		if (scene.spheres.length > 0) executeSphereShadowTrace();
		if (scene.triangles.length > 0) executeTriangleShadowTrace();
		for (var j in scene.meshes){
			executeMeshShadowTrace(scene.meshes[j]);
		}
		executeSceneRender(scene.lights[i]); // This one colors the scene
	}
	
	// First Bounce
	for(var j = 0; j < 5; j++){
		executeBouncePaths();
		if (scene.spheres.length > 0) executeSphereTrace(); 
		if (scene.triangles.length > 0) executeTriangleTrace();
		for (var i in scene.meshes){
			executeMeshTrace(scene.meshes[i]);
		}
		for(var i in scene.lights){
			// We trace shadows for each light in scene
			executeInitShadowTrace(scene.lights[i]); // TO FIX
			if (scene.spheres.length > 0) executeSphereShadowTrace();
			if (scene.triangles.length > 0) executeTriangleShadowTrace();
			for (var k in scene.meshes){
				executeMeshShadowTrace(scene.meshes[k]);
			}
			executeSceneRender(scene.lights[i]); // This one colors the scene
		}
	}
	
	//executeCopyToPixel(scene.lights.length);
	//if(passes%10 == 1){
		executeCopyToPixel(passes);
		sendImagetoHTML();
	//}
	passes++;
}

function postRender(){
	// Release resources
	releaseCLResources();
}

function continuosRender(){
	executeRender();
	if(goon){
		setMsg("Rendering... Pass: " + passes);
		setTimeout(continuosRender,1);
	}else{
		postRender();
		setMsg("Idle.");
	}
}

function stopRender(){
	goon = false;
}

function startRender(){
	preRender();
	goon = true;
	setTimeout(continuosRender,1);
	setMsg("Rendering...");
}

function render(){
	// Load scene
	//var sceneSel = document.getElementById("SceneSel");
	//var sceneName = sceneList[sceneSel.selectedIndex];
	//scene = loadScene("scenes/" + sceneName);
	
	preRender();
	executeRender();
	postRender();
	
	
}

/******************************************************************************
** OLD CODE BEYOND THIS POINT
/*****************************************************************************/

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
