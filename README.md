# pienkuu

A node.js application for packing modules (directories) containing primarily Lua code into zip archives.

## Usage

`node index.js folder-name` where `folder-name` must be a folder that contains a `pienkuu.json` file. See below for examples of the json file contents.

## `pienkuu.json` examples

### Basic

Filetree:
- module/
  - pienkuu.json
  - somefile.txt

`pienkuu.json`:
```json
{}
```

Output:
- module.zip
  - module/
    - somefile.txt

### Ignore list

Filetree:
- module/
  - pienkuu.json
  - bin/compiled.bin
  - somefile.txt

`pienkuu.json`:
```json
{
	"ignore": [
		"bin/*"
	]
}
```

Output:
- module.zip
  - module/
    - somefile.txt

### Dependencies

Filetree:
- module/
  - pienkuu.json
  - somefile.txt
- base/
  - pienkuu.json
  - basefile.txt

`module/pienkuu.json`:
```json
{
	"dependencies": [
		"base"
	]
}
```

`base/pienkuu.json`:
```json
{}
```

Output:
- module.zip
  - module/
    - somefile.txt
  - base/
    - basefile.txt


### Lua minification

Filetree:
- module/
  - pienkuu.json
  - afile.lua

`pienkuu.json`:
```json
{
	"minify": [
        "afile.lua"
    ]
}
```

Output:
- module.zip
  - afile.lua (minified)
