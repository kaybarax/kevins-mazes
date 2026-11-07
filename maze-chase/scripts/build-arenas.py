"""Derive five connected chase arenas from Kevin's original SVG walls.
Requires numpy scipy opencv-python resvg-py. No source artwork is modified.
Largest interior component only: no exterior shortcut or invented wall openings.
"""
from pathlib import Path
import xml.etree.ElementTree as ET
import json, base64, hashlib
import numpy as np, cv2, resvg_py
from scipy.ndimage import distance_transform_edt, label
from scipy.sparse import csr_matrix
from scipy.sparse.csgraph import shortest_path
ROOT=Path(__file__).resolve().parents[1]
ns={'s':'http://www.w3.org/2000/svg'};ET.register_namespace('',ns['s'])
names=['Fern Courtyard','Violet Vault','Midnight Library','Crimson Keep','Ember Ruins']
bgs=['#eef4e8','#f2ebf7','#e9edf6','#f7eae7','#f6efe5']
all_data=[]
for number in range(1,6):
 source=ROOT.parent/'cleaned mazes'/f"Kevin's Maze {number:02}.svg"
 tree=ET.fromstring(source.read_text());walls=tree.find('s:g',ns);color=walls.attrib['stroke']
 # Determine actual wall extents from the rendering, then clip inside them.
 svg='<svg xmlns="http://www.w3.org/2000/svg" width="2000" height="1440"><rect width="2000" height="1440" fill="white"/>'+ET.tostring(walls,encoding='unicode')+'</svg>'
 image=cv2.imdecode(np.frombuffer(resvg_py.svg_to_bytes(svg_string=svg),np.uint8),1)
 ink=image.mean(2)<220;ys,xs=np.where(ink)
 bounds=[int(xs.min()+7),int(ys.min()+7),int(xs.max()-7),int(ys.max()-7)]
 yy,xx=np.indices(ink.shape);clear=distance_transform_edt(~ink)
 # Step two preserves narrow original corridors. Clearance is the navigator radius.
 walk=(clear>=3)&(xx>=bounds[0])&(xx<=bounds[2])&(yy>=bounds[1])&(yy<=bounds[3]);grid=walk[::2,::2]
 comps,n=label(grid);counts=np.bincount(comps.ravel());counts[0]=0;largest=counts.argmax();grid=comps==largest
 # Sparse graph distances select well-spaced safe spawns and reachable objectives.
 nodes=np.flatnonzero(grid);lookup=np.full(grid.size,-1,np.int32);lookup[nodes]=np.arange(len(nodes));cols=grid.shape[1]
 rows=[];columns=[]
 for delta in [1,cols]:
  nxt=nodes+delta;valid=nxt<grid.size
  if delta==1:valid &= nodes%cols < cols-1
  a=nodes[valid];b=nxt[valid];valid=lookup[b]>=0;a=a[valid];b=b[valid]
  rows.extend([lookup[a],lookup[b]]);columns.extend([lookup[b],lookup[a]])
 rr=np.concatenate(rows);cc=np.concatenate(columns);graph=csr_matrix((np.ones(len(rr),np.float32),(rr,cc)),shape=(len(nodes),len(nodes)))
 coords=np.c_[nodes%cols*2,nodes//cols*2]
 def nearest(x,y):return int(np.argmin(((coords-[x,y])**2).sum(axis=1)))
 def dist(i):return shortest_path(graph,directed=False,indices=i,unweighted=True)*2
 # Four farthest-spaced starts; keep all inside the connected original maze.
 chosen=[nearest(bounds[0]+50,bounds[1]+50)];minimum=dist(chosen[0]);distances=[minimum]
 for _ in range(3):
  i=int(minimum.argmax());chosen.append(i);d=dist(i);distances.append(d);minimum=np.minimum(minimum,d)
 starts=coords[chosen].tolist()
 # Keys distributed away from spawn points, each reachable from every spawn.
 keys=[];coverage=minimum.copy()
 for i in range(6):
  target=int(coverage.argmax());keys.append(coords[target].tolist());coverage=np.minimum(coverage,dist(target))
 exits=[coords[nearest(bounds[0]+30,bounds[3]-30)].tolist(),coords[nearest(bounds[2]-30,bounds[1]+30)].tolist()]
 degree=np.bincount(rr,minlength=len(nodes));junctions=int((degree>=3).sum())
 data={'id':str(number),'number':number,'name':names[number-1],'color':color,'background':bgs[number-1], 'width':2000,'height':1440,'bounds':bounds,'step':2,'cols':cols,'rows':grid.shape[0], 'walkable':base64.b64encode(np.packbits(grid.ravel(),bitorder='little').tobytes()).decode(),'starts':starts,'keys':keys,'exits':exits,'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'metrics':{'walkableCells':len(nodes),'spawnMinDistance':float(min(d[j] for i,d in enumerate(distances) for j in chosen if j!=chosen[i])),'maxRoute':float(distances[0].max())}}
 all_data.append(data)
 # Background uses original wall hue; labels and icons are drawn in game coordinates.
 (ROOT/'public'/f'arena-{number}.svg').write_text(svg.replace('fill="white"',f'fill="{bgs[number-1]}"',1))
 print(number,names[number-1],bounds,'cells',len(nodes),'coverage',round(len(nodes)/walk[::2,::2].sum(),2),'spawns',starts,'max route',data['metrics']['maxRoute'])
# Difficulty uses measured travel distance and connected area, not source numbering.
for rank,d in enumerate(sorted(all_data,key=lambda a:a['metrics']['maxRoute'])):
 d['difficulty']=['Gentle','Gentle','Moderate','Hard','Expert'][rank]
 d['description']=['Room to learn the chase.','Long turns and quiet corners.','Choose your shortcuts carefully.','A winding game of pursuit.','Deep routes reward a good memory.'][rank]
(ROOT/'src/arenas.json').write_text(json.dumps(all_data,separators=(',',':'))+'\n')
