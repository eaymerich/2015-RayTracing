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
	float3 p0;
	float3 p1;
	float3 p2;
} Triangle;

typedef struct{
	float3 pmin;
	float3 pmax;
} AABB;

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
   float t; // Value of intersection (distance to eye).
   bool v; // If true, the intersection is valid.
} Intersection;

typedef struct{
   float2 bg; // Baricentric coordinates of intersection (beta/gamma)
   float t; // Value of intersection (distance to eye).
   bool v; // If true, the intersection is valid.
} TriangleIntersection;

typedef struct{
   float tmin;
   float tmax;
   bool v;
} AABBIntersection;

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
	cop = (-0.5f + (col+0.5f)/cam.cols )*cam.width*cam.U +
		(0.5f - (row+0.5f)/cam.rows )*cam.height*cam.V +
		(-1.0f)*cam.W;
	/*
	cop =  cam.eye -cam.width*0.5f*cam.U + col*(cam.width/cam.cols)*cam.U +
		cam.height*0.5f*cam.V - row*(cam.height/cam.rows)*cam.V +
		(0.0f)*cam.W;
		*/
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

inline float3 getPoint(Ray r, float t){
	return r.o + t * r.d;
}

inline Intersection noIntersection(){
	Intersection inter;
	inter.v = false;
	return inter;
}

inline TriangleIntersection interTriangle(Ray ray, Triangle tri){
	TriangleIntersection inter;
	float3 e1 = tri.p1 - tri.p0;
	float3 e2 = tri.p2 - tri.p0;
	
	// Check if ray is parallel to triangle's plane.
	float div = dot(cross(e2,e1),ray.d);
	if(div <= 0){ 
		inter.v = false;
		return inter;
	}
	float idiv = 1.0f / div;
	float3 s = ray.o - tri.p0;
	
	// Calculate Beta.
	float beta = dot(cross(s,ray.d),e2) * idiv;
	if(beta < 0.0f || beta > 1.0f){ 
		inter.v = false;
		return inter;
	}
	
	// Calculate Gamma.
	float gamma = dot(cross(s,e1),ray.d) * idiv;
	if(gamma < 0.0f || gamma > 1.0f || (gamma+beta) < 0.0f || (gamma+beta) > 1.0f){ 
		inter.v = false;
		return inter;
	}
	
	// Calculate t.
	inter.t = dot(cross(s,e2),e1) * -idiv;
	if(inter.t > ray.mint && inter.t < ray.maxt){
		inter.bg = (float2)(beta,gamma);
		inter.v = true;
		return inter;
	}
	
	inter.v = false;
	return inter;	
}

inline AABBIntersection interAABBfast(Ray ray, AABB box){
	AABBIntersection inter;
	float3 tmin = (float3)(0.0f);
	float3 tmax = (float3)(HUGE_VALF);
	float3 ttmin, ttmax;
	float temp;
	ttmin = (box.pmin - ray.o) / ray.d;
	ttmax = (box.pmax - ray.o) / ray.d;
	if(ray.d.x < 0){
		temp = ttmin.x;
		ttmin.x = ttmax.x;
		ttmax.x = temp;
	}
	if(ray.d.y < 0){
		temp = ttmin.y;
		ttmin.y = ttmax.y;
		ttmax.y = temp;
	}
	if(ray.d.z < 0){
		temp = ttmin.z;
		ttmin.z = ttmax.z;
		ttmax.z = temp;
	}
	
	inter.tmin = max(max(max(inter.tmin,ttmin.x),ttmin.y),ttmin.z);
	inter.tmax = min(min(min(inter.tmax,ttmax.x),ttmax.y),ttmax.z);
	if(inter.tmin > inter.tmax){
		inter.v = false;
	}else{
		inter.v = true;
	}
	return inter;
}

inline AABBIntersection interAABB(Ray ray, AABB box){
	AABBIntersection inter;
	inter.tmin = 0.0f;
	inter.tmax = HUGE_VALF;
	float ttmin,ttmax;
	
	// Calculate tmin - tmax for X slab.
	ttmin = (box.pmin.x - ray.o.x) / ray.d.x;
	ttmax = (box.pmax.x - ray.o.x) / ray.d.x;
	if(ray.d.x < 0){
		float temp = ttmin;
		ttmin = ttmax;
		ttmax = temp;
	}
	inter.tmin = max(ttmin,inter.tmin);
	inter.tmax = min(ttmax,inter.tmax);
	if(inter.tmin > inter.tmax){
		inter.v = false;
		return inter;
	}
	
	// Calculate tmin - tmax for Y slab.
	ttmin = (box.pmin.y - ray.o.y) / ray.d.y;
	ttmax = (box.pmax.y - ray.o.y) / ray.d.y;
	if(ray.d.y < 0){
		float temp = ttmin;
		ttmin = ttmax;
		ttmax = temp;
	}
	inter.tmin = max(ttmin,inter.tmin);
	inter.tmax = min(ttmax,inter.tmax);
	if(inter.tmin > inter.tmax){
		inter.v = false;
		return inter;
	}
	
	// Calculate tmin - tmax for Z slab.
	ttmin = (box.pmin.z - ray.o.z) / ray.d.z;
	ttmax = (box.pmax.z - ray.o.z) / ray.d.z;
	if(ray.d.z < 0){
		float temp = ttmin;
		ttmin = ttmax;
		ttmax = temp;
	}
	inter.tmin = max(ttmin,inter.tmin);
	inter.tmax = min(ttmax,inter.tmax);
	if(inter.tmin > inter.tmax){
		inter.v = false;
		return inter;
	}
	
	// We have a valid intersection.
	inter.v = true;
	return inter;
}

inline float3 interpBG(float beta, float gamma, float3 v1, float3 v2, float3 v3){
	return (1.0f-beta-gamma)*v1 + beta*v2 + gamma*v3;
}

inline float3 interp(float2 bg, float3 v1, float3 v2, float3 v3){
	return (1.0f-bg.s0-bg.s1)*v1 + bg.s0*v2 + bg.s1*v3;
}

/**************************************
* Kernels
**************************************/

__kernel void sizeofRay(__global uint* size){
	size[0] = sizeof(Ray);
}

__kernel void initTrace(__global uchar4* pixels, float16 fcam, 
	__global Ray* rays, AABB bound){
	Camera cam = floatToCamera(fcam);
	unsigned int col = get_global_id(0);
	unsigned int row = get_global_id(1);
	if(col >= cam.cols || row >= cam.rows){ return;}
	
	// Create ray through every pixel.
	Ray ray = getRay(cam, col, row);
	
	// Check if ray intersects bounding box.
	AABBIntersection inter = interAABB(ray, bound);
	if(inter.v){
		ray.mint = inter.tmin;
		ray.maxt = inter.tmax;
	}else{
		ray.mint = ray.maxt;
	}
	
	// Store ray.
	rays[cam.cols*row+col] = ray;
	
	// Initialize the raster buffer to background color.
	pixels[cam.cols*row+col] = (uchar4)(0,0,0,255);
}

__kernel void molTrace(__global uchar4* pixels, float16 fcam, __global Ray* rays,
	uint s_size, 
	__global float4* s_atoms,
	__global float4* s_colors,
	AABB bound){

	Camera cam = floatToCamera(fcam);
	unsigned int col = get_global_id(0);
	unsigned int row = get_global_id(1);
	if(col >= cam.cols || row >= cam.rows){ return;}
	
	Ray ray = rays[cam.cols*row+col];
	if(ray.mint == ray.maxt){ // Check if it is a valid ray.
		//pixels[cam.cols*row+col] = (uchar4)(255,255,0,255); // uncomment this to see the scene bounding box.
		return; 
	}
	
	AABBIntersection binter = interAABB(ray,bound);
	if(!binter.v){ 
		//pixels[cam.cols*row+col] = (uchar4)(0,255,255,255); // uncomment this to see the molecule bounding box.
		return; 
	}
	
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
		// Update ray's max_t
		rays[cam.cols*row+col].maxt = champ_t;
		
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

__kernel void meshTrace(__global uchar4* pixels, float16 fcam, __global Ray* rays,
	uint t_size,
	__global float3* t_pos,
	__global float3* t_normal,
	__global uint* t_mindex,
	__global float4* m_color,
	AABB bound ){
	
	Camera cam = floatToCamera(fcam);
	unsigned int col = get_global_id(0);
	unsigned int row = get_global_id(1);
	if(col >= cam.cols || row >= cam.rows){ return;}
	
	Ray ray = rays[cam.cols*row+col];
	if(ray.mint == ray.maxt){ 
		//pixels[cam.cols*row+col] = (uchar4)(255,0,255,255); // uncomment this to see the triangle bounding box.
		return; 
	} // Check if it is a valid ray.
	
	AABBIntersection binter = interAABB(ray,bound);
	if(!binter.v){ 
		//pixels[cam.cols*row+col] = (uchar4)(255,0,255,255); // uncomment this to see the triangle bounding box.
		return; 
	}
	
	TriangleIntersection inter;
	Triangle tri;
	float champ_t = INFINITY;
	uint champ_i = t_size;
	float2 champ_bg;
	uint i;
	for(i = 0; i < t_size; i++){
		// Extract the triangle
		tri.p0 = t_pos[i*3];
		tri.p1 = t_pos[i*3+1];
		tri.p2 = t_pos[i*3+2];
		
		inter = interTriangle(ray, tri);
		if(inter.v && inter.t < champ_t){
			// A closer triangle has been found
			champ_t = inter.t;
			champ_i = i;
			champ_bg = inter.bg;
		}
	}
	
	if(champ_i < t_size){
		// Update ray's max_t.
		rays[cam.cols*row+col].maxt = champ_t;
		
		// Get triangle's normal.
		//float3 normal = t_normal[3*champ_i]; // Normal of first point.
		/*float3 normal = normalize( ( // Average of normals.
			t_normal[3*champ_i] + 
			t_normal[3*champ_i+1] + 
			t_normal[3*champ_i+2] ) / 3.0f );*/
		float3 normal = normalize(interp(champ_bg, // Interpolation of normals.
			t_normal[3*champ_i],
			t_normal[3*champ_i+1], 
			t_normal[3*champ_i+2]));
		
		// Calculate fake shade
		float shade = clamp(dot(cam.W,normal), 0.0f, 1.0f );
		float4 color = m_color[t_mindex[champ_i]] * 255.0f * shade;
		pixels[cam.cols*row+col] = (uchar4)(color.s0,color.s1,color.s2,255);
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
