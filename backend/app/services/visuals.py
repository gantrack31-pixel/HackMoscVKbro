"""Code-native diagram and pictogram geometry shared by all output formats."""
import math
from .icons import icon_data, choose_icon

def hexagon_points(obj):
    return [(obj['x']+x*obj['w'],obj['y']+y*obj['h']) for x,y in ((.18,0),(.82,0),(1,.5),(.82,1),(.18,1),(0,.5))]

def diagram_nodes(slide, box, accent):
    """Normalized, editable nodes and directed connectors; never invent slide claims."""
    nodes=[]
    labels=slide.bullets[:6]
    if not labels: return nodes
    count=len(labels)
    custom=slide.design.smartart if slide.design else None
    # Manual edits can invalidate an old plan: regenerate geometry from current bullets.
    if custom and sorted(n.bullet for n in custom.nodes)!=list(range(count)): custom=None
    kind=custom.type if custom else slide.diagram_type
    width=min(230,box['w']/(min(count,3)+.5))
    height=min(110,box['h']/(math.ceil(count/3)+.6))
    positions=[]; sizes=[]; groups=[]
    edges=[]
    if custom:
        positions=[(box['x']+n.x*box['w'],box['y']+n.y*box['h']) for n in custom.nodes]
        sizes=[(n.w*box['w'],n.h*box['h']) for n in custom.nodes]
        labels=[slide.bullets[n.bullet] for n in custom.nodes]
        groups=[n.group for n in custom.nodes]
        edges=[(e.source,e.target,e.direction) for e in custom.edges]
    elif kind=='cycle':
        height=min(height,box['h']*.22)
        for i in range(count):
            angle=2*math.pi*i/count-math.pi/2
            positions.append((box['x']+box['w']/2+math.cos(angle)*(box['w']/2-width*.7)-width/2,
                              box['y']+box['h']/2+math.sin(angle)*(box['h']/2-height*.7)-height/2))
        edges=[(i,(i+1)%count,'forward') for i in range(count)] if count>1 else []
    elif kind=='hierarchy':
        width=min(width,box['w']*.26);height=min(height,box['h']*.22)
        positions=[(box['x']+(box['w']-width)/2,box['y'])]
        for i in range(1,count):
            level=int(math.log2(i+1)); first=2**level-1; columns=min(2**level,count-first)
            positions.append((box['x']+(i-first+.5)*box['w']/columns-width/2,
                              box['y']+level*box['h']/3))
        edges=[((i-1)//2,i,'forward') for i in range(1,count)]
    elif kind in {'vertical','pyramid'}:
        height=box['h']/count*.78
        for i in range(count):
            w=box['w']*(.3+.65*(i+1)/count) if kind=='pyramid' else box['w']*.8
            positions.append((box['x']+(box['w']-w)/2,box['y']+i*box['h']/count))
            sizes.append((w,height))
        if kind=='vertical':edges=[(i,i+1,'forward') for i in range(count-1)]
    else:
        columns=2 if kind=='matrix' else count if kind=='comparison' else min(count,3)
        rows=math.ceil(count/columns)
        width=box['w']/columns*.86;height=box['h']/rows*.74
        for i in range(count):
            positions.append((box['x']+(i%columns+.07)*box['w']/columns,
                              box['y']+(i//columns+.08)*box['h']/rows))
        if kind=='process':edges=[(i,i+1,'forward') for i in range(count-1)]
    if not sizes:sizes=[(width,height)]*count
    if not groups:groups=list(range(count))
    def segment(id,x1,y1,x2,y2):
        nodes.append({'id':id,'type':'line','x':min(x1,x2),'y':min(y1,y2),
                      'w':abs(x2-x1),'h':abs(y2-y1),'x1':x1,'y1':y1,'x2':x2,'y2':y2,'stroke':accent,'stroke_width':2})
    def boundary(x,y,w,h,dx,dy):
        scale=min(w/2/abs(dx) if dx else float('inf'),h/2/abs(dy) if dy else float('inf'))
        return x+w/2+dx*scale,y+h/2+dy*scale
    for i,(a,b,direction) in enumerate(edges):
        ax,ay=positions[a];bx,by=positions[b];aw,ah=sizes[a];bw,bh=sizes[b]
        dx=bx+bw/2-ax-aw/2;dy=by+bh/2-ay-ah/2
        if not dx and not dy:continue
        x1,y1=boundary(ax,ay,aw,ah,dx,dy);x2,y2=boundary(bx,by,bw,bh,-dx,-dy)
        segment(f'connector-{i}',x1,y1,x2,y2)
        ends=[(x2,y2,math.atan2(dy,dx))] if direction!='none' else []
        if direction=='both':ends.append((x1,y1,math.atan2(-dy,-dx)))
        for j,(x,y,angle) in enumerate(ends):
            for k,offset in enumerate((-.45,.45)):
                segment(f'arrow-{i}-{j}-{k}',x,y,x-9*math.cos(angle+offset),y-9*math.sin(angle+offset))
    for i,((x,y),(w,h),label) in enumerate(zip(positions,sizes,labels)):
        inset = w*.22 if kind=='honeycomb' else 16
        nodes.extend([
            {'id':f'node-bg-{i}','type':'hexagon' if kind=='honeycomb' else 'rect','x':x,'y':y,'w':w,'h':h,'fill':'#F1F5F9','group':groups[i]},
            {'id':f'node-label-{i}','type':'text','x':x+inset,'y':y+10,'w':max(1,w-2*inset),'h':max(1,h-20),
             'text':label,'font_size':26 if kind=='kpi' else 20,'bold':True,'color':'#0F172A','group':groups[i]},
        ])
        if kind!='honeycomb':
            nodes.append({'id':f'node-accent-{i}','type':'rect','x':x,'y':y,'w':5,'h':h,'fill':accent,'group':groups[i]})
    return nodes

def pictogram_nodes(slide, box, accent):
    nodes=[];labels=slide.bullets[:6]
    if not labels: return nodes
    count=len(labels);columns=min(count,3);rows=math.ceil(count/columns)
    for i,label in enumerate(labels):
        cell_w=box['w']/columns;cell_h=box['h']/rows
        x=box['x']+(i%columns)*cell_w;y=box['y']+(i//columns)*cell_h
        selected=slide.icon_names[i] if i<len(slide.icon_names) else 'auto'
        symbol=choose_icon(label) if selected=='auto' else selected
        uploaded=slide.resource_icon_data[i] if i<len(slide.resource_icon_data) else ''
        side=min(56,cell_h*.3,cell_w*.25)
        nodes.append({'id':f'icon-card-{i}','type':'rect','x':x,'y':y,'w':cell_w-16,'h':cell_h-16,'fill':'#F1F5F9'})
        if symbol or uploaded:
            nodes.append({'id':f'icon-{i}','type':'image','x':x+18,'y':y+14,'w':side,'h':side,
                          'src':uploaded or icon_data(symbol,accent),'icon_name':symbol})
        label_y=y+side+24 if symbol else y+18
        nodes.append({'id':f'icon-label-{i}','type':'text','x':x+18,'y':label_y,'w':cell_w-52,'h':max(24,y+cell_h-30-label_y),
                      'text':label,'font_size':24,'bold':True,'color':'#0F172A'})
    return nodes
