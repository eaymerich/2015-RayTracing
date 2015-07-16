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
	float3 p;		// POI = Point of Intersection
	float3 normal; // Normal at point of intersection
	float3 atte;	// Attenuation factor
	int matId;		// Material ID at point of intersection
} Poi;

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

inline float3 getPoint(Ray r, float t){
	return r.o + t * r.d;
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

inline Ray makeRay(float3 ori, float3 dst){
	Ray ray;
	ray.o = ori;
	ray.d = normalize(dst - ori);
	ray.mint = 0.0f;
	//ray.maxt = HUGE_VALF;
	ray.maxt = length(dst - ori);
	return ray;
}

// Distort value from [0,1] to [-1,1]
inline float2 distort(float2 in){
	if(in.x == 0.0f	&& in.y == 0.0f){
		return (float2)(0.0f,0.0f);
	}
	return in*2.0f - 1.0f;
}

/**
 * Original code by Joss Whittle
 * http://l2program.co.uk/900/concentric-disk-sampling
 */
inline float2 concentric_distort(float2 in){
	// Avoid a potential divide by zero
	if (in.x == 0.0f && in.y == 0.0f) {
		return in;
	}
	
	// Initial mapping
	float phi = 0.0f; 
	float radius = 1.0f;
	float a = (2.0f * in.x) - 1.0f;
	float b = (2.0f * in.y) - 1.0f;
	
	// Uses squares instead of absolute values
	if ((a*a) > (b*b)) { 
		 // Top half
		 radius  *= a;
		 phi = (M_PI_4_F) * (b/a);
	}
	else {
		 // Bottom half
		 radius *= b;
		 phi = (M_PI_2_F) - ((M_PI_4_F) * (a/b)); 
	}
	
	// Map the distorted Polar coordinates (phi,radius) 
	// into the Cartesian (x,y) space
	float x = cos(phi) * radius;
	float y = sin(phi) * radius;
	return (float2)(x,y);
}

inline float3 getFocalPoint(Camera cam, float col, float row, float focal_length){
	Ray ray = getRay(cam, col, row);
	float3 pip = cam.eye + focal_length * cam.W * (-1.0f); // A point in focal plane.
	float3 N = cam.W; // Focal plane's normal.
	float d = -dot(pip,N); // d in focal plane's equation.
	float t = -(dot(ray.o,N) + d) / dot(ray.d,N);
	return getPoint(ray,t);
}

inline Ray getThinLensRay(Camera cam, float3 focal_point, float lens_rad, float2 coord){
	Ray ray;
	ray.mint = 0.0f;
	ray.maxt = HUGE_VALF;
	
	// Calculate ray's origin
	float2 dcoor = concentric_distort(coord)*lens_rad;
	ray.o = cam.eye + dcoor.x*cam.U + dcoor.y*cam.V;
	//ray.o = cam.eye;
	
	// Calculate ray's direction
	ray.d = normalize(focal_point-ray.o);
	
	return ray;
}

inline Intersection interSphere(Ray r, Sphere s){
	Intersection inter;
	float a,b,c,dis;
	float3 omc = r.o - s.c;
	a = dot(r.d,r.d);
	b = 2.0f*dot(omc,r.d);
	c = dot(omc,omc) - s.r;
	//c = dot(omc,omc) - s.r*s.r;
	//c = mad(-s.r,s.r,dot(omc,omc));
	//dis = b*b - 4.0f*a*c;
	dis = mad(-4.0f*c,a,b*b);
	
	if(dis < 0.0f){
		// There is no intersection.
		inter.v = false;
		inter.t = HUGE_VALF;
		return inter;
	}
	
	a = 1.0f / (2.0f * a);
	dis = sqrt(dis);
	float t0,t1,tmin,tmax;
	t0 = (-b - dis) * a;
	t1 = (-b + dis) * a;
	tmin = fmin(t0,t1);
	tmax = fmax(t0,t1);
	
	// Find closest intersection.
	// Check if tmin is valid.
	if(tmin >= r.mint && tmin <= r.maxt){
		inter.t = tmin;
		inter.v = true;
		return inter;
	}
	// Check if tmax is valid
	if(tmax >= r.mint && tmax <= r.maxt){
		inter.t = tmax;
		inter.v = true;
		return inter;
	}
	// There is no valid intersection.
	inter.v = false;
	return inter;
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
	if(gamma < 0.0f || /*gamma > 1.0f ||*/ (gamma+beta) < 0.0f || (gamma+beta) > 1.0f){ 
		inter.v = false;
		return inter;
	}
	
	// Calculate t.
	inter.t = dot(cross(s,e2),e1) * -idiv;
	if(inter.t >= ray.mint && inter.t <= ray.maxt){
		inter.bg = (float2)(beta,gamma);
		inter.v = true;
		return inter;
	}
	
	inter.v = false;
	return inter;	
}

inline TriangleIntersection interTriangle2(Ray ray, Triangle tri){
	TriangleIntersection inter;
	inter = interTriangle(ray,tri);
	if(inter.v) return inter;
	float3 temp = tri.p0;
	tri.p0 = tri.p1;
	tri.p1 = temp;
	inter = interTriangle(ray,tri);
	return inter;
}

inline AABBIntersection interAABBfast(Ray ray, AABB box){
	AABBIntersection inter;
	//float3 tmin = (float3)(0.0f);
	//float3 tmax = (float3)(HUGE_VALF);
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
	
	inter.tmin = max(max(max(0.0f,ttmin.x),ttmin.y),ttmin.z);
	inter.tmax = min(min(min(HUGE_VALF,ttmax.x),ttmax.y),ttmax.z);
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

inline Intersection interLight(Ray ray, float3 light_pos, float3 light_normal, float radius){
	Intersection inter;
	inter.v = false;
	float den = dot(ray.d,light_normal);
	if (den == 0.0f) return inter;
	float num = dot((light_pos - ray.o),light_normal);
	if (num == 0.0f) return inter;
	inter.t = num / den;
	float3 poi = getPoint(ray,inter.t);
	if(distance(poi,light_pos) > radius) return inter;
	inter.v = true;
	return inter;
}

inline float3 interpBG(float beta, float gamma, float3 v1, float3 v2, float3 v3){
	return (1.0f-beta-gamma)*v1 + beta*v2 + gamma*v3;
}

inline float3 interp(float2 bg, float3 v1, float3 v2, float3 v3){
	return (1.0f-bg.s0-bg.s1)*v1 + bg.s0*v2 + bg.s1*v3;
}

/*
 * Implementation of Park-Miller Pseudorandom Number Generator
 * (PRNG), adapted from:
 * http://stackoverflow.com/questions/9912143/how-to-get-a-random-number-in-opencl
 * http://www.cems.uwe.ac.uk/~irjohnso/coursenotes/ufeen8-15-m/p1192-parkmiller.pdf
 * http://www0.cs.ucl.ac.uk/staff/ucacbbl/ftp/papers/langdon_2009_CIGPU.pdf
 */
int rand(int *seed){
	const int a = 16807; // i.e. 7^5
	const int m = 2147483647; // i.e. 2^31 - 1
	*seed = (long)(*seed * a) % m;
	return (*seed);
}

float getRand(__global int* seeds){
	const float im = 1.0f / 2147483647.0f; // i.e. 1 / (2^31 - 1)
	int id = get_global_id(0);
	int seed = seeds[id];
	int randon_number = rand(&seed);
	seeds[id] = seed;
	return fabs((float)seed * im);
}

/**************************************
* Kernels
**************************************/

__kernel void sizeofRay(__global uint* size){
	size[0] = sizeof(Ray);
}

__kernel void sizeofPoi(__global uint* size){
	size[0] = sizeof(Poi);
}

__kernel void initAcu (
	__global float4 *acu,
	uint total_rays){
	
	uint id = get_global_id(0);
	if(id >= total_rays) return;
	
	acu[id] = (float4)(0.0f);
}

__kernel void initTrace (
	__global int* seeds, 
	__global Ray* rays, 
	__global Poi* pois,
	AABB bound,
	float16 fcam,
	float focal_length,
	float lens_rad,
	uint rays_per_pixel ){
	
	Camera cam = floatToCamera(fcam);
	unsigned int col = get_global_id(0);
	unsigned int row = get_global_id(1);
	if(col >= cam.cols || row >= cam.rows){ return;}
	
	// Move pointers
	rays += (cam.cols*row+col)*rays_per_pixel;
	pois += (cam.cols*row+col)*rays_per_pixel;
	//acu += (cam.cols*row+col)*rays_per_pixel;
	
	// Get focal point
	float3 focal_point = getFocalPoint(cam,col,row,focal_length);
	
	// Create several rays for each pixel
	if(rays_per_pixel > 1){
		uint rays_per_side = (uint)sqrt((float)rays_per_pixel);
		float delta = 1.0f / rays_per_side; 
		float2 coord;
		coord.y = delta / 2.0f;
		for(unsigned int i=0; i < rays_per_side; i++){
			coord.x = delta / 2.0f;
			for(unsigned int j=0; j < rays_per_side; j++){
				// Create ray
				Ray ray = getThinLensRay(cam, focal_point, lens_rad, coord);
				//Ray ray = getRay(cam, col, row);
				
				// Check if ray intersects bounding box.
				AABBIntersection inter = interAABB(ray, bound);
				if(inter.v){
					ray.mint = inter.tmin;
					ray.maxt = inter.tmax;
				}else{
					ray.mint = ray.maxt;
				}
				
				// Store ray.
				rays[i*rays_per_side+j] = ray;
				
				coord.x += delta;
			}
			coord.y += delta;
		}
	}else{
		float2 coord;
		//coord.y = clamp(getRand(seeds),0.0f,1.0f);
		coord.y = getRand(seeds);
		//coord.x = clamp(getRand(seeds),0.0f,1.0f);
		coord.x = getRand(seeds);
		
		Ray ray = getThinLensRay(cam, focal_point, lens_rad, coord);
		//Ray ray = getRay(cam, col, row);
		
		// Check if ray intersects bounding box.
		AABBIntersection inter = interAABB(ray, bound);
		if(inter.v){
			ray.mint = inter.tmin;
			ray.maxt = inter.tmax;
		}else{
			ray.mint = ray.maxt;
		}
		
		// Store ray.
		rays[0] = ray;
	}
	
	// for(unsigned int i = 0; i < rays_per_pixel; i++){
		// // Initialize the accumulation buffer to background color.
		// acu[i] = (float4)(0.0f,0.0f,0.0f,1.0f);
	// }
	
	for(unsigned int i = 0; i < rays_per_pixel; i++){
		// Initialize Poi as no intersection
		pois[i].matId = -1;
		pois[i].atte = (float3)(1.0f);
	}
}

inline Ray getHemisphereRay(Poi poi, __global int* seeds){
	// Obtain TBN
	float3 T,B,N;
	N = fabs(poi.normal);
	B = poi.normal;
	float nmin = min(min(N.x,N.y),N.z); 
	if(N.x == nmin){ // Get the minimum magnitude component in normal
		B.x = 1.0f;
	}else if(N.y == nmin){
		B.y = 1.0f;
	}else{
		B.z = 1.0f;
	}
	N = poi.normal;
	B = normalize(B);
	T = cross(B,N);
	B = cross(N,T);
	
	// Random sampling of the projection of hemisphere
	float3 s;
	s.x = getRand(seeds);
	s.y = getRand(seeds);
	s.xy = concentric_distort(s.xy);
	s.z = sqrt(max(0.0f, 1.0f - s.x*s.x - s.y*s.y));
	// z = sqrt(1-x*x-y*y)
	
	// Calculate sampling ray
	Ray ray;
	ray.o = poi.p;
	ray.d = normalize(s.x*T + s.y*B + s.z*N);
	ray.mint = 0.0f;
	ray.maxt = HUGE_VALF;
	
	return ray;
}

__kernel void bouncePaths(
	__global Poi* pois,
	__global Ray* rays,
	__global int* seeds,
	uint total_rays){
	
	uint id = get_global_id(0);
	if(id >= total_rays) return;
	
	Poi poi = pois[id];
	Ray ray;
	if(poi.matId >= 0){
		ray = getHemisphereRay(poi,seeds);
	}else{
		ray.mint = ray.maxt = HUGE_VALF;
	}
	rays[id] = ray;
}

__kernel void lightRender(
	__global Poi* pois,
	__global Ray* rays,
	__global float4* acu,
	float16 light_info,
	uint total_rays){

	uint id = get_global_id(0);
	if(id >= total_rays){ return; }
	
	// Get ray
	Ray ray = rays[id];
	if(ray.mint == ray.maxt) { return; }
	
	// Get light info
	float3 light_pos = light_info.s012;
	float3 light_normal = light_info.s345;
	float3 irradiance = normalize(light_info.s678);
	float light_radius = light_info.s9;
	
	// Intersect with light
	Intersection inter = interLight(ray,light_pos,light_normal,light_radius);
	
	if(!inter.v || inter.t >= ray.maxt){ return; }
	
	ray.mint = ray.maxt = HUGE_VALF;
	rays[id] = ray;
	pois[id].matId = -1;
	acu[id] += (float4)(irradiance,1.0f);
}

__kernel void initShadowTrace(
	__global Ray* shadow_rays,
	__global Poi* pois,
	uint total_rays,
	float16 light_info,
	__global int* seeds
	){
	
	uint id = get_global_id(0);
	if(id >= total_rays){ return;}
	
	// Get Poi and 
	Poi poi = pois[id];
	Ray shadow_ray;
	if(poi.matId < 0){
		// No point of intersection. Generate an invalid ray.
		shadow_ray.mint = shadow_ray.maxt = HUGE_VALF;
		shadow_rays[id] = shadow_ray;
		return;
	}
	
	// Get light info
	float3 light_pos = light_info.s012;
	float3 T = light_info.s345;
	float3 B = light_info.s678;
	float light_radius = light_info.s9;
	
	// Displace origin a little bit...
	poi.p += poi.normal * 0.001f;//FLT_MIN * 10.0f;
	
	// Sample source light
	float2 xy;
	xy.x = getRand(seeds);
	xy.y = getRand(seeds);
	xy = concentric_distort(xy) * light_radius;
	light_pos += xy.x*T + xy.y*B;
	//const float size = 0.2;
	//light_pos += (float3)(getRand(seeds)*size, 0.0f, getRand(seeds)*size);
	
	// Calculate and store shadow ray.
	shadow_ray = makeRay(poi.p,light_pos);
	shadow_rays[id] = shadow_ray;
}

__kernel void sphereTrace(
	uint total_rays,
	__global Poi* pois,
	__global Ray* rays,
	__global float4* spheres,
	__global uint* s_matid,
	__global uint* s_box_size,
	AABB bound,
	uint n_slabs){

	uint id = get_global_id(0);
	if(id >= total_rays){ return;}
	
	// Get ray and check if it is valid.
	Ray ray = rays[id];
	if(ray.mint == ray.maxt){ return; }
	AABBIntersection binter = interAABB(ray,bound);
	if(!binter.v){ return; }

	// Intersect with slabs
	// Preparation
	float x, delta_x, delta_tx, x_next, tx_next;
	int xslab, delta_xslab, xslab_limit;
	x = ray.o.x + binter.tmin*ray.d.x;
	delta_x = (bound.pmax.x-bound.pmin.x) / n_slabs;
	xslab = (int)((x-bound.pmin.x)/delta_x);
	if(xslab < 0) xslab = 0;
	if(xslab >= n_slabs) xslab = n_slabs - 1;
	delta_xslab = (ray.d.x >= 0)?1:-1;
	xslab_limit = (ray.d.x >= 0)?(int)n_slabs:-1;
	delta_tx = delta_x / fabs(ray.d.x);
	x_next = bound.pmin.x + (xslab+((ray.d.x >= 0)?1:0))*delta_x;
	tx_next = (x_next-ray.o.x)/ray.d.x;
	
	float y, delta_y, delta_ty, y_next, ty_next;
	int yslab, delta_yslab, yslab_limit;
	y = ray.o.y + binter.tmin*ray.d.y;
	delta_y = (bound.pmax.y-bound.pmin.y) / n_slabs;
	yslab = (int)((y-bound.pmin.y)/delta_y);
	if(yslab < 0) yslab = 0;
	if(yslab >= n_slabs) yslab = n_slabs - 1;
	delta_yslab = (ray.d.y >= 0)?1:-1;
	yslab_limit = (ray.d.y >= 0)?(int)n_slabs:-1;
	delta_ty = delta_y / fabs(ray.d.y);
	y_next = bound.pmin.y + (yslab+((ray.d.y >= 0)?1:0))*delta_y;
	ty_next = (y_next-ray.o.y)/ray.d.y;
	
	float z, delta_z, delta_tz, z_next, tz_next;
	int zslab, delta_zslab, zslab_limit;
	z = ray.o.z + binter.tmin*ray.d.z;
	delta_z = (bound.pmax.z-bound.pmin.z) / n_slabs;
	zslab = (int)((z-bound.pmin.z)/delta_z);
	if(zslab < 0) zslab = 0;
	if(zslab >= n_slabs) zslab = n_slabs - 1;
	delta_zslab = (ray.d.z >= 0)?1:-1;
	zslab_limit = (ray.d.z >= 0)?(int)n_slabs:-1;
	delta_tz = delta_z / fabs(ray.d.z);
	z_next = bound.pmin.z + (zslab+((ray.d.z >= 0)?1:0))*delta_z;
	tz_next = (z_next-ray.o.z)/ray.d.z;
	
	// Slab trace
	Sphere s;
	Intersection inter;
	float champ_t = ray.maxt;
	uint champ_i = UINT_MAX;
	int3 champ_slab = (int3)(n_slabs,n_slabs,n_slabs);
	int3 slab = (int3)(xslab,yslab,zslab);
	float t = binter.tmin;
	uint z_stride = n_slabs*n_slabs;
	uint y_stride = n_slabs;
	while(true){
		// This will assure that intersections are found only inside the slab
		ray.mint = t;
		ray.maxt = min(min(tx_next,ty_next),tz_next);
		
		// Intersect with spheres in slab
		uint begin = s_box_size[slab.z*z_stride+slab.y*y_stride+slab.x];
		uint end = s_box_size[slab.z*z_stride+slab.y*y_stride+slab.x+1];
		for(uint i = begin; i < end; i++){
			float4 sphereData = spheres[i];
			s.c.xyz = sphereData.s012;
			s.r = sphereData.s3;
			inter = interSphere(ray,s);
			if(inter.v && inter.t < champ_t){
				// A closer sphere has been found
				champ_t = inter.t;
				champ_i = i;
				champ_slab = slab;
			}
		}
		// If an intersection was found, break.
		if(champ_i < UINT_MAX) break;
		
		// Advance to next box.
		t = ray.maxt;
		if(t == tx_next){
			tx_next += delta_tx;
			if(t >= binter.tmax) break;
			slab.x += delta_xslab;
			if(slab.x == xslab_limit) break;
		}else if (t == ty_next){
			ty_next += delta_ty;
			if(t >= binter.tmax) break;
			slab.y += delta_yslab;
			if(slab.y == yslab_limit) break;
		}else{
			tz_next += delta_tz;
			if(t >= binter.tmax) break;
			slab.z += delta_zslab;
			if(slab.z == zslab_limit) break;
		}
	}
	
	if(champ_i < UINT_MAX){
		// Update ray's max_t
		rays[id].maxt = champ_t;
		
		// Calculate poi
		Poi poi;
		poi.p = getPoint(ray,champ_t);
		float4 sphereData = spheres[champ_i];
		poi.normal = normalize(poi.p - sphereData.s012);
		poi.matId = s_matid[champ_i];
		pois[id] = poi;
	}
}

__kernel void triangleTrace(
	uint total_rays,
	__global Poi* pois,
	__global Ray* rays,
	__global float3* t_pos,
	__global float3* t_normal,
	__global uint* t_matid,
	__global uint* t_box_size,
	AABB bound,
	uint n_slabs ){

	uint id = get_global_id(0);
	if(id >= total_rays){ return;}
	
	// Check if it is a valid ray.
	Ray ray = rays[id];
	if(ray.mint == ray.maxt){ return; } 
	AABBIntersection binter = interAABB(ray,bound);
	if(!binter.v){ return; }
	
	// Intersect with slabs
	// Preparation
	float x, delta_x, delta_tx, x_next, tx_next;
	int xslab, delta_xslab, xslab_limit;
	x = ray.o.x + binter.tmin*ray.d.x;
	delta_x = (bound.pmax.x-bound.pmin.x) / n_slabs;
	xslab = (int)((x-bound.pmin.x)/delta_x);
	if(xslab < 0) xslab = 0;
	if(xslab >= n_slabs) xslab = n_slabs - 1;
	delta_xslab = (ray.d.x >= 0)?1:-1;
	xslab_limit = (ray.d.x >= 0)?(int)n_slabs:-1;
	delta_tx = delta_x / fabs(ray.d.x);
	x_next = bound.pmin.x + (xslab+((ray.d.x >= 0)?1:0))*delta_x;
	tx_next = (x_next-ray.o.x)/ray.d.x;
	
	float y, delta_y, delta_ty, y_next, ty_next;
	int yslab, delta_yslab, yslab_limit;
	y = ray.o.y + binter.tmin*ray.d.y;
	delta_y = (bound.pmax.y-bound.pmin.y) / n_slabs;
	yslab = (int)((y-bound.pmin.y)/delta_y);
	if(yslab < 0) yslab = 0;
	if(yslab >= n_slabs) yslab = n_slabs - 1;
	delta_yslab = (ray.d.y >= 0)?1:-1;
	yslab_limit = (ray.d.y >= 0)?(int)n_slabs:-1;
	delta_ty = delta_y / fabs(ray.d.y);
	y_next = bound.pmin.y + (yslab+((ray.d.y >= 0)?1:0))*delta_y;
	ty_next = (y_next-ray.o.y)/ray.d.y;
	
	float z, delta_z, delta_tz, z_next, tz_next;
	int zslab, delta_zslab, zslab_limit;
	z = ray.o.z + binter.tmin*ray.d.z;
	delta_z = (bound.pmax.z-bound.pmin.z) / n_slabs;
	zslab = (int)((z-bound.pmin.z)/delta_z);
	if(zslab < 0) zslab = 0;
	if(zslab >= n_slabs) zslab = n_slabs - 1;
	delta_zslab = (ray.d.z >= 0)?1:-1;
	zslab_limit = (ray.d.z >= 0)?(int)n_slabs:-1;
	delta_tz = delta_z / fabs(ray.d.z);
	z_next = bound.pmin.z + (zslab+((ray.d.z >= 0)?1:0))*delta_z;
	tz_next = (z_next-ray.o.z)/ray.d.z;
	
	// Slab trace
	TriangleIntersection inter;
	Triangle tri;
	float champ_t = ray.maxt;
	uint champ_i = UINT_MAX;
	float2 champ_bg;
	int3 champ_slab = (int3)(n_slabs,n_slabs,n_slabs);
	int3 slab = (int3)(xslab,yslab,zslab);
	float t = binter.tmin;
	uint z_stride = n_slabs*n_slabs;
	uint y_stride = n_slabs;
	while(true){
		// This will assure that intersections are found only inside the slab
		ray.mint = t;
		ray.maxt = min(min(tx_next,ty_next),tz_next);
		
		// Intersect with triangles in slab
		uint begin = t_box_size[slab.z*z_stride+slab.y*y_stride+slab.x];
		uint end = t_box_size[slab.z*z_stride+slab.y*y_stride+slab.x+1];
		for(uint i = begin; i < end; i++){ 
			uint ii = i*3;
			// Extract the triangle
			tri.p0 = t_pos[ii];
			tri.p1 = t_pos[ii+1];
			tri.p2 = t_pos[ii+2];
			
			inter = interTriangle(ray, tri);
			if(inter.v && inter.t < champ_t){
				// A closer triangle has been found
				champ_t = inter.t;
				champ_i = i;
				champ_bg = inter.bg;
				champ_slab = slab;
			}
		}
		// If intersection is in slab, break.
		if(champ_i < UINT_MAX) break;
		
		// Advance to next box.
		t = ray.maxt;
		if(t == tx_next){
			tx_next += delta_tx;
			if(t >= binter.tmax) break;
			slab.x += delta_xslab;
			if(slab.x == xslab_limit) break;
		}else if (t == ty_next){
			ty_next += delta_ty;
			if(t >= binter.tmax) break;
			slab.y += delta_yslab;
			if(slab.y == yslab_limit) break;
		}else{
			tz_next += delta_tz;
			if(t >= binter.tmax) break;
			slab.z += delta_zslab;
			if(slab.z == zslab_limit) break;
		}
	}
	
	if(champ_i < UINT_MAX){
		// Update ray's max_t.
		rays[id].maxt = champ_t;
		
		// Calculate poi
		Poi poi;
		poi.p = getPoint(ray, champ_t);
		poi.normal = normalize(interp(champ_bg, // Interpolation of normals.
			t_normal[3*champ_i],
			t_normal[3*champ_i+1], 
			t_normal[3*champ_i+2]));
		poi.matId = t_matid[champ_i];
		pois[id] = poi;
	}
}

__kernel void meshTrace(
	uint total_rays,
	__global Poi* pois,
	__global Ray* rays,
	__global float3* t_pos,
	__global float3* t_normal,
	__global uint* t_box_size,
	uint t_matid,	
	AABB bound,
	uint n_slabs ){

	uint id = get_global_id(0);
	if(id >= total_rays){ return;}
	
	// Check if it is a valid ray.
	Ray ray = rays[id];
	if(ray.mint == ray.maxt){ return; } 
	AABBIntersection binter = interAABB(ray,bound);
	if(!binter.v){ return; }
	
	// Intersect with slabs
	// Preparation
	float x, delta_x, delta_tx, x_next, tx_next;
	int xslab, delta_xslab, xslab_limit;
	x = ray.o.x + binter.tmin*ray.d.x;
	delta_x = (bound.pmax.x-bound.pmin.x) / n_slabs;
	xslab = (int)((x-bound.pmin.x)/delta_x);
	if(xslab < 0) xslab = 0;
	if(xslab >= n_slabs) xslab = n_slabs - 1;
	delta_xslab = (ray.d.x >= 0)?1:-1;
	xslab_limit = (ray.d.x >= 0)?(int)n_slabs:-1;
	delta_tx = delta_x / fabs(ray.d.x);
	x_next = bound.pmin.x + (xslab+((ray.d.x >= 0)?1:0))*delta_x;
	tx_next = (x_next-ray.o.x)/ray.d.x;
	
	float y, delta_y, delta_ty, y_next, ty_next;
	int yslab, delta_yslab, yslab_limit;
	y = ray.o.y + binter.tmin*ray.d.y;
	delta_y = (bound.pmax.y-bound.pmin.y) / n_slabs;
	yslab = (int)((y-bound.pmin.y)/delta_y);
	if(yslab < 0) yslab = 0;
	if(yslab >= n_slabs) yslab = n_slabs - 1;
	delta_yslab = (ray.d.y >= 0)?1:-1;
	yslab_limit = (ray.d.y >= 0)?(int)n_slabs:-1;
	delta_ty = delta_y / fabs(ray.d.y);
	y_next = bound.pmin.y + (yslab+((ray.d.y >= 0)?1:0))*delta_y;
	ty_next = (y_next-ray.o.y)/ray.d.y;
	
	float z, delta_z, delta_tz, z_next, tz_next;
	int zslab, delta_zslab, zslab_limit;
	z = ray.o.z + binter.tmin*ray.d.z;
	delta_z = (bound.pmax.z-bound.pmin.z) / n_slabs;
	zslab = (int)((z-bound.pmin.z)/delta_z);
	if(zslab < 0) zslab = 0;
	if(zslab >= n_slabs) zslab = n_slabs - 1;
	delta_zslab = (ray.d.z >= 0)?1:-1;
	zslab_limit = (ray.d.z >= 0)?(int)n_slabs:-1;
	delta_tz = delta_z / fabs(ray.d.z);
	z_next = bound.pmin.z + (zslab+((ray.d.z >= 0)?1:0))*delta_z;
	tz_next = (z_next-ray.o.z)/ray.d.z;
	
	// Slab trace
	TriangleIntersection inter;
	Triangle tri;
	float champ_t = ray.maxt;
	uint champ_i = UINT_MAX;
	float2 champ_bg;
	int3 champ_slab = (int3)(n_slabs,n_slabs,n_slabs);
	int3 slab = (int3)(xslab,yslab,zslab);
	float t = binter.tmin;
	uint z_stride = n_slabs*n_slabs;
	uint y_stride = n_slabs;
	while(true){
		// This will assure that intersections are found only inside the slab
		ray.mint = t;
		ray.maxt = min(min(tx_next,ty_next),tz_next);
		
		// Intersect with triangles in slab
		uint begin = t_box_size[slab.z*z_stride+slab.y*y_stride+slab.x];
		uint end = t_box_size[slab.z*z_stride+slab.y*y_stride+slab.x+1];
		for(uint i = begin; i < end; i++){ 
			uint ii = i*3;
			// Extract the triangle
			tri.p0 = t_pos[ii];
			tri.p1 = t_pos[ii+1];
			tri.p2 = t_pos[ii+2];
			
			inter = interTriangle(ray, tri);
			if(inter.v && inter.t < champ_t){
				// A closer triangle has been found
				champ_t = inter.t;
				champ_i = i;
				champ_bg = inter.bg;
				champ_slab = slab;
			}
		}
		// If intersection is in slab, break.
		if(champ_i < UINT_MAX) break;
		
		// Advance to next box.
		t = ray.maxt;
		if(t == tx_next){
			tx_next += delta_tx;
			if(t >= binter.tmax) break;
			slab.x += delta_xslab;
			if(slab.x == xslab_limit) break;
		}else if (t == ty_next){
			ty_next += delta_ty;
			if(t >= binter.tmax) break;
			slab.y += delta_yslab;
			if(slab.y == yslab_limit) break;
		}else{
			tz_next += delta_tz;
			if(t >= binter.tmax) break;
			slab.z += delta_zslab;
			if(slab.z == zslab_limit) break;
		}
	}
	
	if(champ_i < UINT_MAX){
		// Update ray's max_t.
		rays[id].maxt = champ_t;
		
		// Calculate poi
		Poi poi;
		poi.p = getPoint(ray, champ_t);
		poi.normal = normalize(interp(champ_bg, // Interpolation of normals.
			t_normal[3*champ_i],
			t_normal[3*champ_i+1], 
			t_normal[3*champ_i+2]));
		poi.matId = t_matid;
		pois[id] = poi;
	}
}


__kernel void sphereShadowTrace(
	uint total_rays,
	__global Ray* shadow_rays,
	__global float4* spheres,
	__global uint* s_box_size,
	AABB bound,
	uint n_slabs){

	uint id = get_global_id(0);
	if(id >= total_rays){ return;}
	
	// Get ray and check if it is valid.
	Ray ray = shadow_rays[id];
	if(ray.mint == ray.maxt){ return; }
	AABBIntersection binter = interAABB(ray,bound);
	if(!binter.v){ return; }

	// Intersect with slabs
	// Preparation
	float x, delta_x, delta_tx, x_next, tx_next;
	int xslab, delta_xslab, xslab_limit;
	x = ray.o.x + binter.tmin*ray.d.x;
	delta_x = (bound.pmax.x-bound.pmin.x) / n_slabs;
	xslab = (int)((x-bound.pmin.x)/delta_x);
	if(xslab < 0) xslab = 0;
	if(xslab >= n_slabs) xslab = n_slabs - 1;
	delta_xslab = (ray.d.x >= 0)?1:-1;
	xslab_limit = (ray.d.x >= 0)?(int)n_slabs:-1;
	delta_tx = delta_x / fabs(ray.d.x);
	x_next = bound.pmin.x + (xslab+((ray.d.x >= 0)?1:0))*delta_x;
	tx_next = (x_next-ray.o.x)/ray.d.x;
	
	float y, delta_y, delta_ty, y_next, ty_next;
	int yslab, delta_yslab, yslab_limit;
	y = ray.o.y + binter.tmin*ray.d.y;
	delta_y = (bound.pmax.y-bound.pmin.y) / n_slabs;
	yslab = (int)((y-bound.pmin.y)/delta_y);
	if(yslab < 0) yslab = 0;
	if(yslab >= n_slabs) yslab = n_slabs - 1;
	delta_yslab = (ray.d.y >= 0)?1:-1;
	yslab_limit = (ray.d.y >= 0)?(int)n_slabs:-1;
	delta_ty = delta_y / fabs(ray.d.y);
	y_next = bound.pmin.y + (yslab+((ray.d.y >= 0)?1:0))*delta_y;
	ty_next = (y_next-ray.o.y)/ray.d.y;
	
	float z, delta_z, delta_tz, z_next, tz_next;
	int zslab, delta_zslab, zslab_limit;
	z = ray.o.z + binter.tmin*ray.d.z;
	delta_z = (bound.pmax.z-bound.pmin.z) / n_slabs;
	zslab = (int)((z-bound.pmin.z)/delta_z);
	if(zslab < 0) zslab = 0;
	if(zslab >= n_slabs) zslab = n_slabs - 1;
	delta_zslab = (ray.d.z >= 0)?1:-1;
	zslab_limit = (ray.d.z >= 0)?(int)n_slabs:-1;
	delta_tz = delta_z / fabs(ray.d.z);
	z_next = bound.pmin.z + (zslab+((ray.d.z >= 0)?1:0))*delta_z;
	tz_next = (z_next-ray.o.z)/ray.d.z;
	
	// Slab trace
	Sphere s;
	Intersection inter;
	float champ_t = ray.maxt;
	uint champ_i = UINT_MAX;
	int3 champ_slab = (int3)(n_slabs,n_slabs,n_slabs);
	int3 slab = (int3)(xslab,yslab,zslab);
	float t = binter.tmin;
	uint z_stride = n_slabs*n_slabs;
	uint y_stride = n_slabs;
	while(true){
		// This will assure that intersections are found only inside the slab
		ray.mint = t;
		ray.maxt = min(min(tx_next,ty_next),tz_next);
		
		// Intersect with spheres in slab
		uint begin = s_box_size[slab.z*z_stride+slab.y*y_stride+slab.x];
		uint end = s_box_size[slab.z*z_stride+slab.y*y_stride+slab.x+1];
		for(uint i = begin; i < end; i++){
			float4 sphereData = spheres[i];
			s.c.xyz = sphereData.s012;
			s.r = sphereData.s3;
			inter = interSphere(ray,s);
			if(inter.v && inter.t < champ_t){
				// Some sphere has been found
				champ_t = inter.t;
				champ_i = i;
				champ_slab = slab;
				break;
			}
		}
		// If an intersection was found, break.
		if(champ_i < UINT_MAX) break;
		
		// Advance to next box.
		t = ray.maxt;
		if(t == tx_next){
			tx_next += delta_tx;
			if(t >= binter.tmax) break;
			slab.x += delta_xslab;
			if(slab.x == xslab_limit) break;
		}else if (t == ty_next){
			ty_next += delta_ty;
			if(t >= binter.tmax) break;
			slab.y += delta_yslab;
			if(slab.y == yslab_limit) break;
		}else{
			tz_next += delta_tz;
			if(t >= binter.tmax) break;
			slab.z += delta_zslab;
			if(slab.z == zslab_limit) break;
		}
	}
	
	if(champ_i < UINT_MAX){
		// Update ray's max_t
		shadow_rays[id].maxt = champ_t;
		shadow_rays[id].mint = champ_t;
	}else{
		// Way is free
		shadow_rays[id].maxt = champ_t;
	}
}

__kernel void triangleShadowTrace(
	uint total_rays,
	__global Ray* shadow_rays,
	__global float3* t_pos,
	__global uint* t_box_size,
	AABB bound,
	uint n_slabs){

	uint id = get_global_id(0);
	if(id >= total_rays){ return;}
	
	// Get ray and check if it is valid.
	Ray ray = shadow_rays[id];
	if(ray.mint == ray.maxt){ return; }
		
	AABBIntersection binter = interAABB(ray,bound);
	if(!binter.v){ return; }

	// Intersect with slabs
	// Preparation
	float x, delta_x, delta_tx, x_next, tx_next;
	int xslab, delta_xslab, xslab_limit;
	x = ray.o.x + binter.tmin*ray.d.x;
	delta_x = (bound.pmax.x-bound.pmin.x) / n_slabs;
	xslab = (int)((x-bound.pmin.x)/delta_x);
	if(xslab < 0) xslab = 0;
	if(xslab >= n_slabs) xslab = n_slabs - 1;
	delta_xslab = (ray.d.x >= 0)?1:-1;
	xslab_limit = (ray.d.x >= 0)?(int)n_slabs:-1;
	delta_tx = delta_x / fabs(ray.d.x);
	x_next = bound.pmin.x + (xslab+((ray.d.x >= 0)?1:0))*delta_x;
	tx_next = (x_next-ray.o.x)/ray.d.x;
	
	float y, delta_y, delta_ty, y_next, ty_next;
	int yslab, delta_yslab, yslab_limit;
	y = ray.o.y + binter.tmin*ray.d.y;
	delta_y = (bound.pmax.y-bound.pmin.y) / n_slabs;
	yslab = (int)((y-bound.pmin.y)/delta_y);
	if(yslab < 0) yslab = 0;
	if(yslab >= n_slabs) yslab = n_slabs - 1;
	delta_yslab = (ray.d.y >= 0)?1:-1;
	yslab_limit = (ray.d.y >= 0)?(int)n_slabs:-1;
	delta_ty = delta_y / fabs(ray.d.y);
	y_next = bound.pmin.y + (yslab+((ray.d.y >= 0)?1:0))*delta_y;
	ty_next = (y_next-ray.o.y)/ray.d.y;
	
	float z, delta_z, delta_tz, z_next, tz_next;
	int zslab, delta_zslab, zslab_limit;
	z = ray.o.z + binter.tmin*ray.d.z;
	delta_z = (bound.pmax.z-bound.pmin.z) / n_slabs;
	zslab = (int)((z-bound.pmin.z)/delta_z);
	if(zslab < 0) zslab = 0;
	if(zslab >= n_slabs) zslab = n_slabs - 1;
	delta_zslab = (ray.d.z >= 0)?1:-1;
	zslab_limit = (ray.d.z >= 0)?(int)n_slabs:-1;
	delta_tz = delta_z / fabs(ray.d.z);
	z_next = bound.pmin.z + (zslab+((ray.d.z >= 0)?1:0))*delta_z;
	tz_next = (z_next-ray.o.z)/ray.d.z;
	
	// Slab trace
	Triangle tri;
	TriangleIntersection inter;
	float champ_t = ray.maxt;
	uint champ_i = UINT_MAX;
	int3 champ_slab = (int3)(n_slabs,n_slabs,n_slabs);
	int3 slab = (int3)(xslab,yslab,zslab);
	float t = binter.tmin;
	uint z_stride = n_slabs*n_slabs;
	uint y_stride = n_slabs;
	while(true){
		// This will assure that intersections are found only inside the slab
		ray.mint = t;
		ray.maxt = min(min(tx_next,ty_next),tz_next);
		
		// Intersect with spheres in slab
		uint begin = t_box_size[slab.z*z_stride+slab.y*y_stride+slab.x];
		uint end = t_box_size[slab.z*z_stride+slab.y*y_stride+slab.x+1];
		for(uint i = begin; i < end; i++){
			uint ii = i*3;
			// Extract the triangle
			tri.p0 = t_pos[ii];
			tri.p1 = t_pos[ii+1];
			tri.p2 = t_pos[ii+2];
			
			inter = interTriangle(ray, tri);
			
			if(inter.v && inter.t < champ_t){
				// A closer triangle has been found
				champ_t = inter.t;
				champ_i = i;
				champ_slab = slab;
				break;
			}
		}
		// If an intersection was found, break.
		if(champ_i < UINT_MAX) break;
		
		// Advance to next box.
		t = ray.maxt;
		if(t == tx_next){
			tx_next += delta_tx;
			if(t >= binter.tmax) break;
			slab.x += delta_xslab;
			if(slab.x == xslab_limit) break;
		}else if (t == ty_next){
			ty_next += delta_ty;
			if(t >= binter.tmax) break;
			slab.y += delta_yslab;
			if(slab.y == yslab_limit) break;
		}else{
			tz_next += delta_tz;
			if(t >= binter.tmax) break;
			slab.z += delta_zslab;
			if(slab.z == zslab_limit) break;
		}
	}
	
	if(champ_i < UINT_MAX){
		// Update ray's max_t
		shadow_rays[id].maxt = champ_t;
		shadow_rays[id].mint = champ_t;
	}else{
		// Way is free
		shadow_rays[id].maxt = champ_t;
		//shadow_rays[id].mint = champ_t;
	}
}

__kernel void sceneRender(
	__global float4* acu,
	__global Poi* pois,
	__global Ray* shadow_rays,
	__global float4* material,
	float16 light_info,
	uint total_rays ){

	uint id = get_global_id(0);
	if(id >= total_rays){ return; }
		
	Poi poi = pois[id];
	
	if(poi.matId >=0){
	
		// Get light info
		//const float area = 1.0f;
		//const float3 es = (float3)(0.9f,0.9f,0.9f); // Irradiance
		//const float3 lpos = (float3)(0.0f,0.75f,0.0f); // Light position
		//const float3 lnor = (float3)(0.0f,-1.0f,0.0f); // Light normal
		float3 lpos = light_info.s012;
		float3 lnor = light_info.s345;
		float3 es = light_info.s678;
		float area = light_info.s9;
	
		float3 shade = (float3)(0.0f,0.0f,0.0f); // Ambient light
		Ray shadow_ray = shadow_rays[id];
		if(shadow_ray.maxt != shadow_ray.mint){
			float r = distance(poi.p, lpos);
			float cosx = clamp(dot(shadow_ray.d,poi.normal), 0.0f, 1.0f );
			float cosy = clamp(dot(-shadow_ray.d,lnor), 0.0f, 1.0f );
		
			// No intersection to light.
			shade = area * ((cosx*cosy)/(r*r)) * es;
		}
		float4 color = material[poi.matId];
		pois[id].atte *= color.s012;
		color.s012 *= poi.atte;
		color.s012 *= shade;
		acu[id] += (float4)(color.s012,1.0f);
	}
}

__kernel void copyToPixel(
	__global uchar4* pixel, 
	__global float4* acu, 
	float m,
	uint pixels,
	uint rays_per_pixel ){
	
	unsigned int id = get_global_id(0);
	if(id >= pixels) return;
	
	acu += id*rays_per_pixel;
	float4 color = (float4)(0.0f,0.0f,0.0f,0.0f);
	for(unsigned int i = 0; i < rays_per_pixel; i++){
		color += acu[i];
	}
	color *= 255.0f*m;
	color *= 1.8f;
	color = clamp(color, 0.0f,255.0f);
	pixel[id] = (uchar4)(color.s0,color.s1,color.s2,255);
	//pixel[id] = (uchar4)(255,255,256,255);
}
/*
__kernel void molTrace(__global uchar4* pixels, float16 fcam, __global Ray* rays,
	uint s_size, 
	__global float4* s_atoms,
	__global uint* s_mindex,
	__global float4* m_color,
	AABB bound,
	uint n_slabs,
	__global uint* slab_size){

	Camera cam = floatToCamera(fcam);
	unsigned int col = get_global_id(0);
	unsigned int row = get_global_id(1);
	if(col >= cam.cols || row >= cam.rows){ return;}
	
	Ray ray = rays[cam.cols*row+col];
	// Check if it is a valid ray.
	if(ray.mint == ray.maxt){ return; }
	AABBIntersection binter = interAABB(ray,bound);
	if(!binter.v){ return; }
	
	// Intersect with slabs
	// Preparation
	float x, delta_x, delta_tx, x_next, tx_next;
	int xslab, delta_xslab, xslab_limit;
	x = ray.o.x + binter.tmin*ray.d.x;
	delta_x = (bound.pmax.x-bound.pmin.x) / n_slabs;
	xslab = (int)((x-bound.pmin.x)/delta_x);
	if(xslab < 0) xslab = 0;
	if(xslab >= n_slabs) xslab = n_slabs - 1;
	delta_xslab = (ray.d.x >= 0)?1:-1;
	xslab_limit = (ray.d.x >= 0)?(int)n_slabs:-1;
	delta_tx = delta_x / fabs(ray.d.x);
	x_next = bound.pmin.x + (xslab+((ray.d.x >= 0)?1:0))*delta_x;
	tx_next = (x_next-ray.o.x)/ray.d.x;
	
	float y, delta_y, delta_ty, y_next, ty_next;
	int yslab, delta_yslab, yslab_limit;
	y = ray.o.y + binter.tmin*ray.d.y;
	delta_y = (bound.pmax.y-bound.pmin.y) / n_slabs;
	yslab = (int)((y-bound.pmin.y)/delta_y);
	if(yslab < 0) yslab = 0;
	if(yslab >= n_slabs) yslab = n_slabs - 1;
	delta_yslab = (ray.d.y >= 0)?1:-1;
	yslab_limit = (ray.d.y >= 0)?(int)n_slabs:-1;
	delta_ty = delta_y / fabs(ray.d.y);
	y_next = bound.pmin.y + (yslab+((ray.d.y >= 0)?1:0))*delta_y;
	ty_next = (y_next-ray.o.y)/ray.d.y;
	
	float z, delta_z, delta_tz, z_next, tz_next;
	int zslab, delta_zslab, zslab_limit;
	z = ray.o.z + binter.tmin*ray.d.z;
	delta_z = (bound.pmax.z-bound.pmin.z) / n_slabs;
	zslab = (int)((z-bound.pmin.z)/delta_z);
	if(zslab < 0) zslab = 0;
	if(zslab >= n_slabs) zslab = n_slabs - 1;
	delta_zslab = (ray.d.z >= 0)?1:-1;
	zslab_limit = (ray.d.z >= 0)?(int)n_slabs:-1;
	delta_tz = delta_z / fabs(ray.d.z);
	z_next = bound.pmin.z + (zslab+((ray.d.z >= 0)?1:0))*delta_z;
	tz_next = (z_next-ray.o.z)/ray.d.z;
	
	// Slab trace
	Sphere s;
	Intersection inter;
	float champ_t = ray.maxt;
	uint champ_i = s_size;
	int3 champ_slab = (int3)(n_slabs,n_slabs,n_slabs);
	int3 slab = (int3)(xslab,yslab,zslab);
	float t = binter.tmin;
	uint z_stride = n_slabs*n_slabs;
	uint y_stride = n_slabs;
	while(true){
		// This will assure that intersections are found only inside the slab
		ray.mint = t;
		ray.maxt = min(min(tx_next,ty_next),tz_next);
		
		// Intersect with spheres in slab
		uint begin = slab_size[slab.z*z_stride+slab.y*y_stride+slab.x];
		uint end = slab_size[slab.z*z_stride+slab.y*y_stride+slab.x+1];
		for(uint i = begin; i < end; i++){
			float4 atom = s_atoms[i];
			s.c.xyz = atom.s012;
			s.r = atom.s3;
			inter = interSphere(ray,s);
			if(inter.v && inter.t < champ_t){
				// A closer sphere has been found
				champ_t = inter.t;
				champ_i = i;
				champ_slab = slab;
			}
		}
		// If intersection is in slab, break.
		if(champ_slab.z < n_slabs) break;
		
		t = ray.maxt;
		if(t == tx_next){
			tx_next += delta_tx;
			if(t >= binter.tmax) break;
			slab.x += delta_xslab;
			if(slab.x == xslab_limit) break;
		}else if (t == ty_next){
			ty_next += delta_ty;
			if(t >= binter.tmax) break;
			slab.y += delta_yslab;
			if(slab.y == yslab_limit) break;
		}else{
			tz_next += delta_tz;
			if(t >= binter.tmax) break;
			slab.z += delta_zslab;
			if(slab.z == zslab_limit) break;
		}
	}
	
	if(champ_slab.z < n_slabs){
		// Update ray's max_t
		rays[cam.cols*row+col].maxt = champ_t;
		
		// Calculate a fake shade
		s.c.xyz = s_atoms[champ_i].s012;
		float3 ipoint = getPoint(ray,champ_t);
		float shade = clamp(dot(cam.W,normalize(ipoint-s.c)), 0.0f, 1.0f );
		
		// Get material color
		//float4 fcolor = m_color[s_mindex[champ_i]] * shade * 255.0f;
		
		// Calculate a fake color according to slab number
		float4 fcolor = (float4)(
			((champ_slab.x)%2)+1,
			((champ_slab.y)%2)+1,
			((champ_slab.z)%2)+1,
			1.0f);
		fcolor *= shade * 127.0f;
		
		// Set final color
		pixels[cam.cols*row+col] = (uchar4)(fcolor.s0,fcolor.s1,fcolor.s2, 255);
	}
}

__kernel void meshTrace(__global uchar4* pixels, float16 fcam, __global Ray* rays,
	uint t_size,
	__global float3* t_pos,
	__global float3* t_normal,
	__global uint* t_mindex,
	__global float4* m_color,
	AABB bound,
	uint n_slabs,
	__global uint* slab_size){
	
	Camera cam = floatToCamera(fcam);
	unsigned int col = get_global_id(0);
	unsigned int row = get_global_id(1);
	if(col >= cam.cols || row >= cam.rows){ return;}
	
	Ray ray = rays[cam.cols*row+col];
	 // Check if it is a valid ray.
	if(ray.mint == ray.maxt){ return; } 
	AABBIntersection binter = interAABB(ray,bound);
	if(!binter.v){ return; }
	
	// Intersect with slabs
	// Preparation
	float x, delta_x, delta_tx, x_next, tx_next;
	int xslab, delta_xslab, xslab_limit;
	x = ray.o.x + binter.tmin*ray.d.x;
	delta_x = (bound.pmax.x-bound.pmin.x) / n_slabs;
	xslab = (int)((x-bound.pmin.x)/delta_x);
	if(xslab < 0) xslab = 0;
	if(xslab >= n_slabs) xslab = n_slabs - 1;
	delta_xslab = (ray.d.x >= 0)?1:-1;
	xslab_limit = (ray.d.x >= 0)?(int)n_slabs:-1;
	delta_tx = delta_x / fabs(ray.d.x);
	x_next = bound.pmin.x + (xslab+((ray.d.x >= 0)?1:0))*delta_x;
	tx_next = (x_next-ray.o.x)/ray.d.x;
	
	float y, delta_y, delta_ty, y_next, ty_next;
	int yslab, delta_yslab, yslab_limit;
	y = ray.o.y + binter.tmin*ray.d.y;
	delta_y = (bound.pmax.y-bound.pmin.y) / n_slabs;
	yslab = (int)((y-bound.pmin.y)/delta_y);
	if(yslab < 0) yslab = 0;
	if(yslab >= n_slabs) yslab = n_slabs - 1;
	delta_yslab = (ray.d.y >= 0)?1:-1;
	yslab_limit = (ray.d.y >= 0)?(int)n_slabs:-1;
	delta_ty = delta_y / fabs(ray.d.y);
	y_next = bound.pmin.y + (yslab+((ray.d.y >= 0)?1:0))*delta_y;
	ty_next = (y_next-ray.o.y)/ray.d.y;
	
	float z, delta_z, delta_tz, z_next, tz_next;
	int zslab, delta_zslab, zslab_limit;
	z = ray.o.z + binter.tmin*ray.d.z;
	delta_z = (bound.pmax.z-bound.pmin.z) / n_slabs;
	zslab = (int)((z-bound.pmin.z)/delta_z);
	if(zslab < 0) zslab = 0;
	if(zslab >= n_slabs) zslab = n_slabs - 1;
	delta_zslab = (ray.d.z >= 0)?1:-1;
	zslab_limit = (ray.d.z >= 0)?(int)n_slabs:-1;
	delta_tz = delta_z / fabs(ray.d.z);
	z_next = bound.pmin.z + (zslab+((ray.d.z >= 0)?1:0))*delta_z;
	tz_next = (z_next-ray.o.z)/ray.d.z;
	
	// Slab trace
	TriangleIntersection inter;
	Triangle tri;
	float champ_t = ray.maxt;
	uint champ_i = t_size;
	float2 champ_bg;
	int3 champ_slab = (int3)(n_slabs,n_slabs,n_slabs);
	int3 slab = (int3)(xslab,yslab,zslab);
	float t = binter.tmin;
	uint z_stride = n_slabs*n_slabs;
	uint y_stride = n_slabs;
	while(true){
		// This will assure that intersections are found only inside the slab
		ray.mint = t;
		ray.maxt = min(min(tx_next,ty_next),tz_next);
		
		// Intersect with triangles in slab
		uint begin = slab_size[slab.z*z_stride+slab.y*y_stride+slab.x];
		uint end = slab_size[slab.z*z_stride+slab.y*y_stride+slab.x+1];
		for(uint i = begin; i < end; i++){ 
			uint ii = i*3;
			// Extract the triangle
			tri.p0 = t_pos[ii];
			tri.p1 = t_pos[ii+1];
			tri.p2 = t_pos[ii+2];
			
			inter = interTriangle(ray, tri);
			if(inter.v && inter.t < champ_t){
				// A closer triangle has been found
				champ_t = inter.t;
				champ_i = i;
				champ_bg = inter.bg;
				champ_slab = slab;
			}
		}
		// If intersection is in slab, break.
		if(champ_slab.x < n_slabs) break;
		
		t = ray.maxt;
		if(t == tx_next){
			tx_next += delta_tx;
			if(t >= binter.tmax) break;
			slab.x += delta_xslab;
			if(slab.x == xslab_limit) break;
		}else if (t == ty_next){
			ty_next += delta_ty;
			if(t >= binter.tmax) break;
			slab.y += delta_yslab;
			if(slab.y == yslab_limit) break;
		}else{
			tz_next += delta_tz;
			if(t >= binter.tmax) break;
			slab.z += delta_zslab;
			if(slab.z == zslab_limit) break;
		}
	}
	
	if(champ_slab.x < n_slabs){
		// Update ray's max_t.
		rays[cam.cols*row+col].maxt = champ_t;
		
		// Get triangle's normal.
		//float3 normal = t_normal[3*champ_i]; // Normal of first point.
		// float3 normal = normalize( ( // Average of normals.
			// t_normal[3*champ_i] + 
			// t_normal[3*champ_i+1] + 
			// t_normal[3*champ_i+2] ) / 3.0f );
		float3 normal = normalize(interp(champ_bg, // Interpolation of normals.
			t_normal[3*champ_i],
			t_normal[3*champ_i+1], 
			t_normal[3*champ_i+2]));
		
		// Calculate fake shade
		float shade = clamp(dot(cam.W,normal), 0.0f, 1.0f );
		
		// Get material color
		//float4 fcolor = m_color[t_mindex[champ_i]] * 255.0f * shade;
		
		// Calculate fake color according to slab number
		float4 fcolor = (float4)(
			((champ_slab.x)%2)+1,
			((champ_slab.y)%2)+1,
			((champ_slab.z)%2)+1,
			1.0f);
		fcolor *= shade * 127.0f;
		
		// Set final color
		pixels[cam.cols*row+col] = (uchar4)(fcolor.s0,fcolor.s1,fcolor.s2,255);
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
	
}*/
