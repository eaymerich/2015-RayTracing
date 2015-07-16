/*
	returns an object with the following properties:
		nTriangles // Number of triangles in the mesh 
		nMaterials // Number of materials used in the mesh 
		materialIndices // Material index used by each triangle 
		materials // Materials array. At the moment it holds only a base diffuse color for each material
		bounds // Bound object: with two 3 element arrays "min" and "max" as properties 
		positions // Position coordinates of the triangle vertices. 3 vertices per triangle. Each position has 3 floats: 1 float each for X, Y and Z 
		normals	// Normal vector array.  3 normal vector per triangle. Each vector has 3 floats: 1 float each for X, Y and Z 
		tCoords // [Optional] Texture coordinate array. 3 tex coordinates per triangles. Each tex coordinate has 2 floats: 1 float for s, and t
*/
function parseMeshJSON(jsonFileName)
{
    "use strict";
	var model = parseJSON(jsonFileName);
	var nVertices = 0;
	var nTriangles = 0;
	var positionArray=[], normalArray=[], tCoordArray=[];
	var nMaterials = 0; 
	var matIndexArray=[], materials=[];
	var b = new Bounds();
	var nNodes = (model.nodes) ? model.nodes.length : 1;
	//console.log(nNodes);
	for (var k=0; k<nNodes; k++){
		//console.log(k);
		var mMatrix = mat4.create();
		if (model.nodes)mat4.copy(mMatrix,model.nodes[k].modelMatrix);
		var nMatrix = mat3.normalFromMat4(mat3.create(),mMatrix)
		var nMeshes = (model.nodes) ? model.nodes[k].meshIndices.length : model.meshes.length;
		for (var n = 0; n < nMeshes; n++){
			var index = (model.nodes) ? model.nodes[k].meshIndices[n] : n;
			var mesh = model.meshes[index];
			var materialIndex = mesh.materialIndex;
			for (var i = 0; i<mesh.vertexPositions.length; i+=3) {
				var vertex = vec3.transformMat4(vec3.create(), [mesh.vertexPositions[i], mesh.vertexPositions[i+1], mesh.vertexPositions[i+2]], mMatrix);
				if (vertex[0] < b.min[0]) b.min[0] = vertex[0];
				if (vertex[0] > b.max[0]) b.max[0] = vertex[0]; 
				if (vertex[1] < b.min[1]) b.min[1] = vertex[1];
				if (vertex[1] > b.max[1]) b.max[1] = vertex[1];
				if (vertex[2] < b.min[2]) b.min[2] = vertex[2];
				if (vertex[2] > b.max[2]) b.max[2] = vertex[2]; 
			}
			var nV = (mesh.indices) ? mesh.indices.length : (mmesh.vertexPositions.length / 3);
			var nT = nV/3;
			nVertices += nV;
			nTriangles += nT;
			for(var i=0; i<nT; i++){ // Triangle has 3 vertices. Vertex has 3 coordinates
				for (var j=0; j<3; j++){
					var vIndex = i*3+j;
					if (mesh.indices) vIndex = mesh.indices[vIndex];
					var vertex = vec3.transformMat4(vec3.create(), [mesh.vertexPositions[vIndex*3+0], mesh.vertexPositions[vIndex*3+1], mesh.vertexPositions[vIndex*3+2]], mMatrix);
					positionArray.push(vertex[0]);positionArray.push(vertex[1]);positionArray.push(vertex[2]);
					var normal = vec3.transformMat3(vec3.create(), [mesh.vertexNormals[vIndex*3+0], mesh.vertexNormals[vIndex*3+1], mesh.vertexNormals[vIndex*3+2]], nMatrix);
					normalArray.push(normal[0]);normalArray.push(normal[1]);normalArray.push(normal[2]);
					if (mesh.vertexTexCoordinates && mesh.vertexTexCoordinates[0]){
						tCoordArray.push(mesh.vertexTexCoordinates[0][vIndex*2+0]);
						tCoordArray.push(mesh.vertexTexCoordinates[0][vIndex*2+1]);
					}
				}
				matIndexArray.push(materialIndex);
			}
		}
	}
	var nMaterials=0;
	model.materials.forEach(
	  function (m) {
	   nMaterials++;
	   materials.push(m.diffuseReflectance[0]);
	   materials.push(m.diffuseReflectance[1]);
	   materials.push(m.diffuseReflectance[2]);
	   materials.push(m.diffuseReflectance[3]);
	  }
	);
	
	console.log("nVertices: "+nVertices+"["+positionArray.length/3+","+normalArray.length/3+","+tCoordArray.length/2+"]");
	console.log("Triangles: "+nTriangles+"["+nVertices/3+"]");
	return {nTriangles: nTriangles, nMaterials: nMaterials, materialIndices: matIndexArray, materials: materials, bounds:b, positions:positionArray, normals:normalArray, tCoords: ((tCoordArray.length==nVertices*2)?tCoordArray:null)}
}