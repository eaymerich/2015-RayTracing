"use strict";
function parsePDB(str) { 
	var ElementColors = {"H": 0xCCCCCC, "C": 0xAAAAAA, "O": 0xCC0000, "N": 0x0000CC, "S": 0xCCCC00, "P": 0x6622CC,
							 "F": 0x00CC00, "CL": 0x00CC00, "BR": 0x882200, "I": 0x6600AA,
							 "FE": 0xCC6600, "CA": 0x8888AA};
	// Reference: A. Bondi, J. Phys. Chem., 1964, 68, 441.
	var vdwRadii =  {"H": 1.2, "Li": 1.82, "Na": 2.27, "K": 2.75, "C": 1.7, "N": 1.55, "O": 1.52,
					   "F": 1.47, "P": 1.80, "S": 1.80, "CL": 1.75, "BR": 1.85, "SE": 1.90,
					   "ZN": 1.39, "CU": 1.4, "NI": 1.63};
   var atoms = [];
   var lines = str.split("\n");
   for (var i = 0; i < lines.length; i++) {
      var line = lines[i].replace(/^\s*/, ''); // remove indent
      var recordName = line.substr(0, 6);
      if (recordName == 'ATOM  ' || recordName == 'HETATM') {
         var atom, resn, chain, resi, x, y, z, hetflag, elem, serial, altLoc, b;
         altLoc = line.substr(16, 1);
         if (altLoc != ' ' && altLoc != 'A')continue; // FIXME: ad hoc
         serial = parseInt(line.substr(6, 5));
         atom = line.substr(12, 4).replace(/ /g, "");
         resn = line.substr(17, 3);
         chain = line.substr(21, 1);
         resi = parseInt(line.substr(22, 5)); 
         x = parseFloat(line.substr(30, 8));
         y = parseFloat(line.substr(38, 8));
         z = parseFloat(line.substr(46, 8));
         b = parseFloat(line.substr(60, 8));
         elem = line.substr(76, 2).replace(/ /g, "");
         if (elem == '') { // for some incorrect PDB files
            elem = line.substr(12, 4).replace(/ /g,"");
         }
         if (line[0] == 'H') hetflag = true;
         else hetflag = false;
         atoms[serial-1] = {'atom': atom, 'elem': elem, 'x': x, 'y': y, 'z': z, 'bonds': [], 'bondOrder': []};
      }
	  else if (recordName == 'CONECT') {
         var from = parseInt(line.substr(6, 5));
         for (var j = 0; j < 4; j++) {
            var to = parseInt(line.substr([11, 16, 21, 26][j], 5));
            if (isNaN(to)) continue;
            if (atoms[from-1] != undefined) {
               atoms[from-1].bonds.push(to-1);
               atoms[from-1].bondOrder.push(1-1);
            }
         }
     } else if (recordName == 'HEADER') {
         console.log(line.substr(8, 50));
      }
   }
   var colorData=[];
   var radiusData=[];
   var atomData=[];
   var atomsUsed={};
   var runningIndex=0;
   var minP = [Number.MAX_VALUE,Number.MAX_VALUE,Number.MAX_VALUE];
   var maxP = [-Number.MAX_VALUE,-Number.MAX_VALUE,-Number.MAX_VALUE];
   for (i in atoms){
    var atom = atoms[i].elem;
	var R;
	if (atomsUsed[atom] == undefined){
		var rgb=hex2rgb(ElementColors[atom]);
		colorData.push(rgb.r);colorData.push(rgb.g);colorData.push(rgb.b);colorData.push(1)
		radiusData.push(vdwRadii[atom]);
		R = vdwRadii[atom];
		atomsUsed[atom] = runningIndex;
		atomData.push(runningIndex);
		runningIndex++;
	}
	else{
		atomData.push(atomsUsed[atom]);
		R = radiusData[atomsUsed[atom]];
	}
	atomData.push(atoms[i].x);atomData.push(atoms[i].y);atomData.push(atoms[i].z);
	if (atoms[i].x-R < minP[0]) minP[0] = atoms[i].x-R; if (atoms[i].x+R > maxP[0]) maxP[0] = atoms[i].x+R;
	if (atoms[i].y-R < minP[1]) minP[1] = atoms[i].y-R; if (atoms[i].y+R > maxP[1]) maxP[1] = atoms[i].y+R;
	if (atoms[i].z-R < minP[2]) minP[2] = atoms[i].z-R; if (atoms[i].z+R > maxP[2]) maxP[2] = atoms[i].z+R;
   }
   return {size:atoms.length, atomData:atomData, colorData:colorData, radiusData:radiusData, bounds: new Bounds(minP, maxP)};
   function hex2rgb(hex){
    var r = ((hex >> 16) & 255)/255;
    var g = ((hex >> 8) & 255)/255;
    var b = (hex & 255)/255;
    return {r:r,g:g,b:b};
   }
};
