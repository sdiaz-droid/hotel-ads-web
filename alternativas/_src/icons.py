import re, json, pathlib, sys
D = pathlib.Path.home()/'pxsol-pms-comercial/node_modules/lucide-react/dist/esm/icons'
names = sys.argv[1:]
out = {}
for n in names:
    t = (D/f'{n}.mjs').read_text(encoding='utf8')
    node = t.split('const __iconNode = ')[1].split(';\nconst')[0]
    parts = re.findall(r'\[\s*"(\w+)",\s*\{([^}]*)\}\s*\]', node)
    svg = ''
    for tag, attrs in parts:
        kv = re.findall(r'(\w+): "([^"]*)"', attrs)
        svg += '<%s %s/>' % (tag, ' '.join('%s="%s"' % (k, v) for k, v in kv if k != 'key'))
    out[n] = svg
json.dump(out, open(pathlib.Path(__file__).parent/'icons.json', 'w', encoding='utf8'), indent=0)
print(len(out))
