"""File-specific manifest. Original OOXML remains authoritative for complex primitives."""
from collections import Counter
from hashlib import sha256
import posixpath
import re
from zipfile import ZipFile
from lxml import etree
from .palette import blend, hex_color

NORMALIZATION_VERSION = '5'


def fingerprint(path):
    digest = sha256()
    with open(path, 'rb') as stream:
        for block in iter(lambda: stream.read(1024*1024), b''):
            digest.update(block)
    return digest.hexdigest()


def local(node):
    return etree.QName(node).localname if isinstance(node.tag,str) else ''


def parse_manifest(path, package):
    palette, elements, backgrounds, typography = set(), [], [], []
    background_counts, text_counts = Counter(), Counter()
    with ZipFile(path) as archive:
        names = set(archive.namelist())
        roots = {}
        def read(part):
            if part not in roots:
                roots[part] = etree.fromstring(archive.read(part), etree.XMLParser(resolve_entities=False,no_network=True,load_dtd=False))
            return roots[part]
        def relatives(part):
            relpath = posixpath.join(posixpath.dirname(part), '_rels', posixpath.basename(part)+'.rels')
            if relpath not in names: return []
            return [(r.get('Type','').rsplit('/',1)[-1], posixpath.normpath(posixpath.join(posixpath.dirname(part),r.get('Target',''))).lstrip('/'))
                    for r in read(relpath) if r.get('TargetMode') != 'External']
        def inheritance(part, seen=None):
            seen = set() if seen is None else seen
            if part in seen or part not in names: return []
            seen.add(part)
            result = [part]
            for kind, target in relatives(part):
                if kind in {'slideLayout','slideMaster','theme'}:
                    result.extend(inheritance(target,seen))
            return result
        for part in sorted(names):
            if not re.fullmatch(r'ppt/(slides|slideMasters|slideLayouts)/[^/]+\.xml',part): continue
            root = read(part)
            chain = inheritance(part)
            theme = next((read(p) for p in chain if '/theme/' in p), None)
            scheme = {}
            if theme is not None:
                for node in theme.xpath('//*[local-name()="clrScheme"]/*'):
                    if len(node):
                        value = hex_color('#'+(node[0].get('lastClr') or node[0].get('val','')))
                        if value: scheme[local(node)] = value
            palette.update(scheme.values())
            mapping = {'bg1':'lt1','tx1':'dk1','bg2':'lt2','tx2':'dk2'}
            # Master mappings first, then local overrides.
            for ancestor in reversed(chain):
                for node in read(ancestor).xpath('//*[local-name()="clrMap" or local-name()="overrideClrMapping"]'):
                    mapping.update(node.attrib)
            def resolve(node):
                kind = local(node)
                if kind == 'schemeClr':
                    color = scheme.get(mapping.get(node.get('val'),node.get('val')))
                elif kind in {'srgbClr','sysClr'}:
                    color = hex_color('#'+(node.get('lastClr') or node.get('val','')))
                else: return None
                if not color: return None
                for child in node:
                    try: amount = max(0,min(1,int(child.get('val','100000'))/100000))
                    except ValueError: continue
                    if local(child) == 'tint': color = blend(color,'#FFFFFF',amount)
                    elif local(child) == 'shade': color = blend(color,'#000000',amount)
                    elif local(child) in {'lumMod','lumOff'}:
                        import colorsys
                        rgb = tuple(int(color[i:i+2],16)/255 for i in (1,3,5))
                        h,l,s = colorsys.rgb_to_hls(*rgb)
                        l = l*amount if local(child)=='lumMod' else min(1,l+amount)
                        color = '#'+''.join(f'{round(v*255):02X}' for v in colorsys.hls_to_rgb(h,l,s))
                return color
            for node in root.iter():
                color = resolve(node)
                if color:
                    palette.add(color)
                    if any(local(a)=='bg' for a in node.iterancestors()): background_counts[color] += 1
                    if any(local(a) in {'rPr','defRPr'} for a in node.iterancestors()): text_counts[color] += 1
                if node.get('typeface'):
                    typography.append({'part':part,'path':root.getroottree().getpath(node),'font':node.get('typeface')})
                if local(node) == 'bg':
                    backgrounds.append({'part':part,'xml':etree.tostring(node,encoding='unicode')})
                if local(node) not in {'sp','pic','grpSp','cxnSp','graphicFrame'}: continue
                # Exact geometry/fill XML and XPath allow resolving every primitive in the retained package.
                descriptors = node.xpath('./*[local-name()="spPr" or local-name()="grpSpPr" or local-name()="xfrm" or local-name()="style"]')
                elements.append({'part':part,'path':root.getroottree().getpath(node),'type':local(node),
                                 'properties':[etree.tostring(n,encoding='unicode') for n in descriptors],
                                 'relationships':[{'type':kind,'target':target} for kind,target in relatives(part)],
                                 'grouped':any(local(a)=='grpSp' for a in node.iterancestors())})
    return {'version':NORMALIZATION_VERSION,'fingerprint':fingerprint(path),'palette':sorted(palette),
            'background':background_counts.most_common(1)[0][0] if background_counts else None,
            'text_color':text_counts.most_common(1)[0][0] if text_counts else None,
            'fonts':package['fonts'],'typography':typography,'elements':elements,'backgrounds':backgrounds,
            'themes':package['themes'],'parts':package['parts'],'retention':'original_opc_package',
            'rendering_complete':False}
