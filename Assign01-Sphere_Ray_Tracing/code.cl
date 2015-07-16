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
   float rows, cols;// "rows" and "cols" are the the number of pixels rows and columns
} Camera;

typedef struct{
   bool v; // If true, the intersection is valid.
   float t; // Value of intersection (distance to eye).
} Intersection;

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
	cam.rows = in.sE;
	cam.cols = in.sF;
	return cam;
}

inline Ray getRay(Camera cam, float col, float row) {
	Ray ray;
	float3 cop; // Center of Pixel
	ray.o = cam.eye;
	cop = (-0.5f + (col+0.5f)/cam.cols)*cam.width*cam.U +
	      (0.5f - (row+0.5f)/cam.rows)*cam.height*cam.V +
	      (-1.0f)*cam.W;
	ray.d = normalize(cop - ray.o);
	ray.mint = 0.0;
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
	if(dis < 0.0){
		// There is no intersection.
		inter.v = false;
		inter.t = HUGE_VALF;
		return inter;
	}
	float t0,t1;
	t0 = (-b - sqrt(dis)) / 2*a;
	t1 = (-b + sqrt(dis)) / 2*a;
	
	// Find closest intersection.
	// Check if t0 is valid.
	if(t0 > r.mint && t0 < r.maxt){
		inter.t = t0;
		inter.v = true;
		return inter;
	}
	// Check if t1 is valid
	if(t1 > r.mint && t1 < r.maxt){
		inter.t = t1;
		inter.v = true;
		return inter;
	}
	// There is no valid intersection.
	inter.v = false;
	return inter;
	
	/*
	inter.t = t0;
	if(inter.t < 0.0f){
		inter.t = t1;
		if(inter.t < 0.0f){
			// There is no valid intersection:
			// both are behind the eye.
			inter.v = false;
			return inter;
		}
	}
	inter.v = true;
	return inter;
	*/
}

/**************************************
* Kernels
**************************************/
__kernel void raytrace(__global uchar4* pixels, float16 fcam) {
	Camera cam = floatToCamera(fcam);
	unsigned int col = get_global_id(0);
	unsigned int row = get_global_id(1);
	
	// Create a sphere to test the functions.
	// Normally this would come from the host application,
	// but for now it is easier to define it here.
	Sphere s;
	s.c = (float3)(0.0f,0.0f,1.0f);
	s.r = 0.5f;
	
	// Get the corresponding ray for this pixel.
	Ray ray;
	ray = getRay(cam, col, row);
	
	// Find the intersection between ray and sphere.
	Intersection inter;
	inter = interSphere(ray,s);
	
	// If the intersection is valid, use the distance t to give some
	// fake shade to the sphere. If the intersection is not valid, paint
	// the pixel with background color (black).
	uchar4 color;
	if(inter.v){
		uchar base = (uchar)((1.0f-inter.t)*255.0f);
		color = (uchar4)(base, base, base, 255);
	}else{
		color = (uchar4)(0,0,0,255);
	}
	pixels[((unsigned int)cam.cols)*row+col] = color;
}

/*
__kernel void colorfill(__global uchar4* pixels, uint2 imageSize) {
	unsigned int cols = imageSize.s0;
	unsigned int rows = imageSize.s1;
	unsigned int col = get_global_id(0);
	unsigned int row = get_global_id(1);
	
	uchar4 color = (uchar4)(0, 255, 255, 255);
	pixels[row*cols+col] = color;
}*/
