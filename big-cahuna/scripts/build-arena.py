"""Derive collision data from the exact published SVG. Run in Python with
numpy, scipy, resvg-py, and opencv-python installed. Runtime needs no Python.
"""
from pathlib import Path
import xml.etree.ElementTree as ET
import json,base64,hashlib,re
import numpy as np,cv2,resvg_py
from scipy.ndimage import distance_transform_edt,label
from scipy.spatial import cKDTree
ROOT=Path(__file__).resolve().parents[1]
source=ROOT.parent/'cleaned mazes'/"Kevin's Maze 24.svg"
text=source.read_text();ns={'s':'http://www.w3.org/2000/svg'}
ET.register_namespace('',ns['s']);tree=ET.fromstring(text)
walls=next(g for g in tree.findall('s:g',ns) if g.attrib.get('transform')=='translate(100 45)')
wallsvg='<svg xmlns="http://www.w3.org/2000/svg" width="2000" height="1440"><rect width="2000" height="1440" fill="white"/>'+ET.tostring(walls,encoding='unicode')+'</svg>'
image=cv2.imdecode(np.frombuffer(resvg_py.svg_to_bytes(svg_string=wallsvg),np.uint8),1)
ink=image.mean(2)<225
clearance=distance_transform_edt(~ink)
# Confine play to the arena. Exits trigger before its outer edge; there is no
# traversable exterior perimeter that could bypass the maze.
bounds=(112,88,1873,1221)
yy,xx=np.indices(ink.shape)
walk=(clearance>=2.5)&(xx>=bounds[0])&(xx<=bounds[2])&(yy>=bounds[1])&(yy<=bounds[3])
step=2;grid=walk[::step,::step];components,n=label(grid)

def nearest(x,y,component=None):
 ys,xs=np.where(grid if component is None else components==component)
 j=np.argmin((xs*step-x)**2+(ys*step-y)**2)
 return int(ys[j]*grid.shape[1]+xs[j])
def position(i):return [i%grid.shape[1]*step,i//grid.shape[1]*step]
starts=[nearest(220,635),nearest(1770,635)]
ids=[int(components.flat[i]) for i in starts]
items=[]
values={'The Big Cahuna':25,'Carrot':10,'orange':9,'smile':8,'star':7,'thumb':5}
collect=tree.find("s:g[@id='collectibles']",ns)
for j,g in enumerate(collect):
 title=g.find('s:title',ns).text
 x,y=map(float,re.search(r'translate\(([^ ]+) ([^)]+)\)',g.attrib['transform']).groups())
 node=nearest(x,y);comp=int(components.flat[node]);items.append({'id':str(j),'kind':title,'value':values[title],'x':x,'y':y,'node':node,'component':comp})
# Approved game-only doorways: join isolated collectible chambers to the
# main walkable region using the shortest crossing, without touching the source.
doors=[]
for item in items:
 target=nearest(item['x'],item['y']);main=int(components.flat[starts[0]])
 comp=int(components.flat[target])
 if comp==main:continue
 ay,ax=np.where(components==main);by,bx=np.where(components==comp)
 a=np.c_[ax*step,ay*step];b=np.c_[bx*step,by*step]
 distances,indices=cKDTree(a).query(b);j=int(np.argmin(distances))
 p1=a[indices[j]].astype(int);p2=b[j].astype(int)
 door={'from':p1.tolist(),'to':p2.tolist(),'width':14,'item':item['id']}
 doors.append(door)
 cut=np.zeros_like(ink,dtype=np.uint8);cv2.line(cut,tuple(p1),tuple(p2),1,14)
 ink[cut.astype(bool)]=False
 clearance=distance_transform_edt(~ink)
 walk=(clearance>=2.5)&(xx>=bounds[0])&(xx<=bounds[2])&(yy>=bounds[1])&(yy<=bounds[3])
 grid=walk[::step,::step];components,n=label(grid)
for item in items:
 item['node']=nearest(item['x'],item['y']);item['component']=int(components.flat[item['node']])
 assert item['component']==int(components.flat[starts[0]]),item
print('Approved game doorways:',doors)
overlay=''.join(f'<path d="M {d["from"][0]} {d["from"][1]} L {d["to"][0]} {d["to"][1]}" stroke="white" stroke-width="{d["width"]}" stroke-linecap="round"/>' for d in doors)
wallsvg=wallsvg.replace('</svg>',overlay+'</svg>')
exits=[{'x':1000,'y':115,'radius':40},{'x':1000,'y':1197,'radius':40}]
print('Start components:',ids,'component sizes:',[(i,int((components==i).sum())) for i in set(ids)])
print('Collectible components:',[(x['kind'],x['component']) for x in items])
print('Exit components:',[int(components.flat[nearest(e['x'],e['y'])]) for e in exits])
data={'version':1,'doors':doors,'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'width':2000,'height':1440,'step':step,'cols':grid.shape[1],'rows':grid.shape[0],'walkable':base64.b64encode(np.packbits(grid.flatten(),bitorder='little').tobytes()).decode(),'bounds':bounds,'starts':[position(i) for i in starts],'exits':exits,'items':items}
(ROOT/'src/arena.json').write_text(json.dumps(data,separators=(',',':'))+'\n')
(ROOT/'public/arena.svg').write_text(wallsvg)
# Each collectible remains a vector asset with its existing artwork.
for item,g in zip(items,collect):
 x,y=item['x'],item['y'];size=190 if item['kind']=='The Big Cahuna' else 110
 svg=f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{x-size/2} {y-size/2} {size} {size}">'+ET.tostring(g,encoding='unicode')+'</svg>'
 (ROOT/f"public/item-{item['id']}.svg").write_text(svg)
