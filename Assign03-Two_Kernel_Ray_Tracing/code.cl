/**************************************
* University of Central Florida
* COP6721 Ray Tracing
* Spring 2015
* Student: Edward Aymerich
**************************************/

/**************************************
* Structure Definitions
**************************************/
typedef struct{
  float3 c; // Center
  float r; // Radius
} Sphere;

typedef struct{
   float3 o; // Origin
   float3 d; // Direction
   float mint, maxt; // Limits of ray parameter t. At initialization time mint=0, maxt=infinity
} Ray;

typedef struct{
   float3 eye;
   float3 U, V, W;
   float width, height; // "width" and "height" are width and heigh of the canvas window in scene space. 
   uint cols, rows;// "cols" and "rows" are the the number of pixels rows and columns
} Camera;

typedef struct{
   bool v; // If true, the intersection is valid.
   float t; // Value of intersection (distance to eye).
} Intersection;

typedef struct{
   uint size;
   __global float4* atoms;
   __global float4* colors;
} Scene;

/**************************************
* Auxiliary Functions
**************************************/
inline Camera floatToCamera(float16 in){
	Camera cam;
	cam.eye = in.s012;
	cam.U = in.s345;
	cam.V = in.s678;
	cam.W = in.s9AB;
	cam.width = in.sC;
	cam.height = in.sD;
	cam.cols = (uint)in.sE;
	cam.rows = (uint)in.sF;
	return cam;
}

inline Ray getParallelRay(Camera cam, float col, float row) {
	Ray ray;
	float3 cop; // Center of Pixel
	cop =  cam.eye -cam.width*0.5f*cam.U + col*(cam.width/cam.cols)*cam.U +
		cam.height*0.5f*cam.V - row*(cam.height/cam.rows)*cam.V +
		(0.0f)*cam.W;
	ray.o = cop;
	ray.d = (-1.0f)*cam.W;
	ray.mint = 0.0f;
	ray.maxt = HUGE_VALF;
	return ray;
}

inline Ray getRay(Camera cam, float col, float row) {
	Ray ray;
	float3 cop;
	cop = (-0.5f + (col+0.5f)/cam.cols )*cam.width*cam.U +
		(0.5f - (row+0.5f)/cam.rows )*cam.height*cam.V +
		(-1.0f)*cam.W;
	ray.d = normalize(cop);
	ray.o = cam.eye;
	ray.mint = 0.0f;
	ray.maxt = HUGE_VALF;
	return ray;
}

inline Intersection interSphere(Ray r, Sphere s){
	Intersection inter;
	float a,b,c,dis;
	a = dot(r.d,r.d);
	b = 2.0f*dot(r.o-s.c,r.d);
	c = dot(r.o-s.c,r.o-s.c) - s.r*s.r;
	dis = b*b - 4.0f*a*c;
	
	if(dis < 0.0f){
		// There is no intersection.
		inter.v = false;
		inter.t = HUGE_VALF;
		return inter;
	}
	float t0,t1,tmin,tmax;
	t0 = (-b - sqrt(dis)) / 2*a;
	t1 = (-b + sqrt(dis)) / 2*a;
	tmin = fmin(t0,t1);
	tmax = fmax(t0,t1);
	
	// Find closest intersection.
	// Check if tmin is valid.
	if(tmin > r.mint && tmin < r.maxt){
		inter.t = tmin;
		inter.v = true;
		return inter;
	}
	// Check if tmax is valid
	if(tmax > r.mint && tmax < r.maxt){
		inter.t = tmax;
		inter.v = true;
		return inter;
	}
	// There is no valid intersection.
	inter.v = false;
	return inter;
}

float3 getPoint(Ray r, float t){
	return r.o + t * r.d;
}

/**************************************
* Kernels
**************************************/

__kernel void sizeofRay(__global uint* size){
	size[0] = sizeof(Ray);
}

__kernel void initTrace(__global uchar4* pixels, float16 fcam, __global Ray* rays){
	Camera cam = floatToCamera(fcam);
	unsigned int col = get_global_id(0);
	unsigned int row = get_global_id(1);
	if(col >= cam.cols || row >= cam.rows){ return;}
	
	// Create ray through every pixel.
	rays[cam.cols*row+col] = getRay(cam, col, row);
	
	// Initialize the raster buffer to background color.
	pixels[cam.cols*row+col] = (uchar4)(0,0,0,255);
}

__kernel void molTrace(__global uchar4* pixels, float16 fcam, __global Ray* rays,
	uint s_size, 
	__global float4* s_atoms,
	__global float4* s_colors){

	Camera cam = floatToCamera(fcam);
	unsigned int col = get_global_id(0);
	unsigned int row = get_global_id(1);
	if(col >= cam.cols || row >= cam.rows){ return;}
	
	Ray ray = rays[cam.cols*row+col];
	Sphere s;
	Intersection inter;
	uint i;
	float champ_t = INFINITY;
	uint champ_i = s_size;
	for(i = 0; i < s_size; i++){
		float4 atom = s_atoms[i];
		s.c.xyz = atom.s012;
		s.r = atom.s3;
		inter = interSphere(ray,s);
		if(inter.v && inter.t < champ_t){
			// A closer sphere has been found
			champ_t = inter.t;
			champ_i = i;
		}
	}
	
	if(champ_i < s_size){
		// Update ray's min_t
		rays[cam.cols*row+col].mint = champ_t;
		
		// Calculate a fake shade
		s.c.xyz = s_atoms[champ_i].s012;
		float3 ipoint = getPoint(ray,champ_t);
		float shade = clamp(dot(cam.W,normalize(ipoint-s.c)), 0.0f, 1.0f );
		
		// Calculate final color
		float4 fcolor = s_colors[champ_i] * shade * 255.0f;
		uchar4 color = (uchar4)(fcolor.s0,fcolor.s1,fcolor.s2, 255);
		pixels[cam.cols*row+col] = color;
	}
}

__kernel void raytrace(__global uchar4* pixels, 
	float16 fcam, 
	uint s_size, 
	__global float4* s_atoms,
	__global float4* s_colors) {
	
	Camera cam = floatToCamera(fcam);
	unsigned int col = get_global_id(0);
	unsigned int row = get_global_id(1);
	if(col >= cam.cols || row >= cam.rows){ return;}
	
	// Get the corresponding ray for this pixel.
	Ray ray;
	ray = getRay(cam, col, row);
	//ray = getParallelRay(cam, col, row);
	
	// Find the intersection between ray and spheres.
	Sphere s;
	Intersection inter;
	uint i;
	float champ_t = INFINITY;
	uint champ_i = s_size;
	for(i = 0; i < s_size; i++){
		s.c.xyz = s_atoms[i].s012;
		s.r = s_atoms[i].s3;
		inter = interSphere(ray,s);
		if(inter.v && inter.t < champ_t){
			// A closer sphere has been found
			champ_t = inter.t;
			champ_i = i;
		}
	}
	
	uchar4 color = (uchar4)(0,0,0,255);
	// If there is an intersection
	if(champ_i < s_size){
		// Calculate a fake shade
		s.c.xyz = s_atoms[champ_i].s012;
		float3 ipoint = getPoint(ray,champ_t);
		float shade = dot(cam.W,normalize(ipoint-s.c));
		
		// Calculate final color
		float4 fcolor = s_colors[champ_i] * shade * 255.0f;
		color = (uchar4)(fcolor.s0,fcolor.s1,fcolor.s2, 255);
	}
	pixels[cam.cols*row+col] = color;
	
}
