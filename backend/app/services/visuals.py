"""Code-native diagram and pictogram geometry shared by all output formats."""
import math

def diagram_nodes(slide, box, accent):
    nodes=[]
    labels=(slide.bullets or ['Первый этап', 'Следующий этап', 'Результат'])[:6]
    count=len(labels)
    width=min(230,box['w']/(min(count,3)+.5))
    height=min(96,box['h']/3.5)
    positions=[]
    if slide.diagram_type=='cycle':
        for i in range(count):
            angle=2*math.pi*i/count-math.pi/2
            positions.append((box['x']+box['w']/2+math.cos(angle)*(box['w']/2-width*.7)-width/2,
                              box['y']+box['h']/2+math.sin(angle)*(box['h']/2-height*.8)-height/2))
        edges=[(i,(i+1)%count) for i in range(count)] if count>1 else []
    elif slide.diagram_type=='hierarchy':
        positions=[(box['x']+(box['w']-width)/2,box['y'])]
        for i in range(1,count):
            columns=min(3,count-1); row=(i-1)//columns
            positions.append((box['x']+(i-1)%columns*box['w']/columns+(box['w']/columns-width)/2,
                              box['y']+(row+1)*box['h']/3))
        edges=[(0,i) for i in range(1,count)]
    else:
        for i in range(count):
            columns=min(count,3)
            positions.append((box['x']+i%columns*box['w']/columns+(box['w']/columns-width)/2,
                              box['y']+i//columns*box['h']/2+24))
        edges=[(i,i+1) for i in range(count-1)]
    for i,(a,b) in enumerate(edges):
        ax,ay=positions[a];bx,by=positions[b]
        if abs(ay-by)<10:
            x1,y1=ax+width,ay+height/2;x2,y2=bx,by+height/2
        else:
            x1,y1=ax+width/2,ay+height;x2,y2=bx+width/2,by
        nodes.append({'id':f'connector-{i}','type':'line','x':min(x1,x2),'y':min(y1,y2),
                      'w':abs(x2-x1),'h':abs(y2-y1),'x1':x1,'y1':y1,'x2':x2,'y2':y2,'stroke':accent,'stroke_width':3})
    for i,((x,y),label) in enumerate(zip(positions,labels)):
        nodes.extend([
            {'id':f'node-bg-{i}','type':'rect','x':x,'y':y,'w':width,'h':height,'fill':'#F1F5F9'},
            {'id':f'node-accent-{i}','type':'rect','x':x,'y':y,'w':5,'h':height,'fill':accent},
            {'id':f'node-label-{i}','type':'text','x':x+16,'y':y+12,'w':width-28,'h':height-20,
             'text':label,'font_size':20,'bold':True,'color':'#0F172A'},
        ])
    return nodes

def pictogram_nodes(slide, box, accent):
    nodes=[];labels=(slide.bullets or ['Идея', 'Команда', 'Результат'])[:6]
    defaults=['idea','people','target','growth','shield','clock']
    count=len(labels);columns=min(count,3);rows=math.ceil(count/columns)
    for i,label in enumerate(labels):
        cell_w=box['w']/columns;cell_h=box['h']/rows
        x=box['x']+(i%columns)*cell_w+20;y=box['y']+(i//columns)*cell_h+12
        symbol=slide.icon_names[i] if i<len(slide.icon_names) else defaults[i]
        def shape(t,dx,dy,w,h,fill=accent):
            nodes.append({'id':f'icon-{i}-{len(nodes)}','type':t,'x':x+dx,'y':y+dy,'w':w,'h':h,'fill':fill})
        if symbol=='people':
            for dx in (0,28,56):shape('ellipse',dx+6,0,16,16);shape('rect',dx,22,28,30)
        elif symbol=='target':
            for d,color in ((64,accent),(44,'#FFFFFF'),(24,accent)):
                shape('ellipse',(64-d)/2,(64-d)/2,d,d,color)
        elif symbol=='growth':
            for j in range(3):shape('rect',j*24,48-j*16,16,16+j*16)
        elif symbol=='shield':
            shape('rect',4,0,58,34);shape('ellipse',4,10,58,48)
            shape('rect',29,12,8,30,'#FFFFFF');shape('rect',18,23,30,8,'#FFFFFF')
        elif symbol=='clock':
            shape('ellipse',0,0,64,64);shape('ellipse',6,6,52,52,'#FFFFFF')
            shape('rect',30,12,4,22);shape('rect',30,32,18,4)
        else:
            shape('ellipse',7,0,48,44);shape('rect',22,40,18,16);shape('rect',24,60,14,4)
        nodes.append({'id':f'icon-label-{i}','type':'text','x':x,'y':y+78,'w':cell_w-40,'h':cell_h-90,
                      'text':label,'font_size':22,'bold':True,'color':'#0F172A'})
    return nodes
