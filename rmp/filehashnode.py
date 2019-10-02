
import os
import uuid
from globalsettings import AUDIO_EXT, COVER_EXT

def make_file(path, name, directory=False, parent=None):
    entry = {
        'name': name,
        'directory': directory,
        'id': str(uuid.uuid4()),
        'parent': parent
    }
    
    if directory:
        entry['children'] = []
    
    return entry


def cmp_to_key(comparator):
    'Convert a cmp= function into a key= function'
    class K(object):

        def __init__(self, obj, *args):
            self.obj = obj

        def __lt__(self, other):
            return comparator(self.obj, other.obj) < 0

        def __gt__(self, other):
            return comparator(self.obj, other.obj) > 0

        def __eq__(self, other):
            return comparator(self.obj, other.obj) == 0

        def __le__(self, other):
            return comparator(self.obj, other.obj) <= 0

        def __ge__(self, other):
            return comparator(self.obj, other.obj) >= 0

        def __ne__(self, other):
            return comparator(self.obj, other.obj) != 0

    return K

def dircmp(a, b):
    if a['directory'] and not b['directory']:
        return -1
    elif not a['directory'] and b['directory']:
        return 1
    elif a['name'].lower() < b['name'].lower():
        return -1
    elif a['name'].lower() > b['name'].lower():
        return 1

    return 0

     
class FileHashNodeTree:
    def __init__(self, root):
        self.root = root
        self.nodes = None
        self.mappings = None
        self.pathmappings = None

    def get_files(self): return self.nodes
    def get_mapping(self): return self.mappings
    def get_pathhash(self): return self.pathmappings
        
    def scan_directory(self, path, name='.', parent='.', oldHash=None):
        oldPathHash = None
        if oldHash is not None and type(oldHash) is FileHashNodeTree:
            oldPathHash = oldHash.get_pathhash()
            
        self.nodes, self.mappings, self.pathmappings = self.scan_directory_r(path, name, parent, oldPathHash)

    def scan_directory_r(self, path, name='.', parent='.', oldPathHash=None):
        fileMapping = {}
        pathMapping = {}
        curDirPath = os.path.normpath(os.path.join(path, name))
        node = make_file(path, name, True, parent)
        fileMapping[str(node['id'])] = node
        pathMapping[curDirPath] = node

        for root, dirs, files in os.walk(curDirPath):
            newDirs = list(dirs)
            del(dirs[:])
            for file in files:
                fullpath = os.path.normpath(os.path.join(curDirPath, file))
                if oldPathHash is not None and fullpath in oldPathHash:
                    continue
            
                ext = os.path.splitext(file)
                if file[0] != '.' and ext[1] in AUDIO_EXT:
                    newFile = make_file(root, file, False, node['id'])
                    node['children'].append(newFile)
                    fileMapping[newFile['id']] = newFile
                    pathMapping[fullpath] = newFile
                elif file[0] != '.' and ext[1] in COVER_EXT:
                    pathMapping[fullpath] = file
                    if 'covers' not in node: node['covers'] = []
                    node['covers'].append(file)
                

            for d in newDirs:
                childNodes, childFiles, childPaths = self.scan_directory_r(root, d, node['id'], oldPathHash)
                if len(childFiles) > 0:
                    if len(childFiles) == 1:
                        continue
                    
                    node['children'].append(childNodes)
                    fileMapping.update(childFiles)
                    pathMapping.update(childPaths)
                elif 'covers' in childNodes and len(childNodes['covers']) > 0:
                    for i, cover in enumerate(childNodes['covers']):
                        childNodes['covers'][i] = d + '/' + cover
                
                    if 'covers' not in node: node['covers'] = []
                    node['covers'].extend(childNodes['covers'])

            node['children'] = sorted(node['children'], key=cmp_to_key(dircmp))

        return node, fileMapping, pathMapping


    #If multiple scans are made to the file system, this function
    #will recurse through the new scan (which should contain only
    #the differences from the first scan with oldPathHash provided)
    #and attempt to match up node ID's with the ID's generated in the
    #initial scan
    #this resolved diff can be send to the client to merge
    def resolve_scan_diff(self, path='.', name='.', parent='.', otherFileHash=None):
        if otherFileHash is None or type(otherFileHash) is not FileHashNodeTree:
            return

        self.resolve_scan_diff_r(self.nodes, path, name, parent,  otherFileHash.get_pathhash())

    
    def resolve_scan_diff_r(self, diff, path='.', name='.', parent='.',  oldPathHash=None):
        curFile = os.path.normpath(os.path.join(path, name))
        if curFile in oldPathHash:
            diff['id'] = oldPathHash[curFile]['id']
            diff['parent'] = oldPathHash[curFile]['parent']
        else:
            diff['parent'] = parent

        if diff['directory'] and len(diff['children']):
            for c in diff['children']:
                self.resolve_scan_diff_r(c, curFile, c['name'], diff['id'], oldPathHash)


    def rm_node(self, node):
        if node['directory'] and 'children' in node:
            for child in node['children']:
                self.rm_node(child)

        parent = None
        if node['parent'] in self.mappings:
            parent = self.mappings[node['parent']]
        else:
            return
        
        for i, child in enumerate(parent['children']):
            if child['id'] == node['id']:
                parent['children'].pop(i)
                break
            
        self.mappings.pop(node['id'], None)


    def merge_scan_diff(self, otherHash):
        if otherHash is None or type(otherHash) is not FileHashNodeTree:
            return

        self.merge_scan_diff_r(otherHash.nodes, otherHash.root)
        rmPathList = []
        rmNodes = []
        # now remove any files that no longer exist in the file system
        for path in self.pathmappings:
            t = os.path.realpath(path)
            if os.path.exists(t): continue
            print("{} does not exist?".format(t))
            #if it no longer exists...
            node = self.pathmappings[path]
            if type(node) is not dict: continue
            #remove all references to that node
            #self.pathmappings.pop(path, None)
            rmPathList.append(path)
            rmNodes.append(node['id'])
            self.rm_node(node)

        for path in rmPathList: self.pathmappings.pop(path, None)
        return rmNodes

    
    def merge_scan_diff_r(self, node, path='.', name='.', top=False):
        curFileName = os.path.normpath(os.path.join(path, name))
        
        if node['id'] not in self.mappings:
            if node['parent'] != '.':
                parent = self.mappings[node['parent']]
                if not top:
                    parent['children'].append(node)
                    parent['children'] = sorted(parent['children'], key=cmp_to_key(dircmp))
                    top = True

                
            self.mappings[node['id']] = node
            self.pathmappings[curFileName] = node
        
        if node['directory'] and 'children' in node:
            for c in node['children']:
                self.merge_scan_diff_r(c, curFileName, c['name'], top)

            node['children'] = sorted(node['children'], key=cmp_to_key(dircmp))
        
