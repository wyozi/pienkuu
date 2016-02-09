"use strict";

// Configuration
let globalIgnoreFilters = [
	"*/.git/**",
	"*/pienkuu.json"
];

// Requires
let fs = require('fs');
let minimatch = require("minimatch");
let Zip = new require('node-zip');
let recursiveReaddirSync = require('recursive-readdir-sync');

// Command line arguments
let argv = require('minimist')(process.argv.slice(2));

let sourceFolderName = argv._[0];
if (!sourceFolderName) {
	console.warn("Please provide a folder name as the first argument.");
	process.exit(1);
}

let outputFileName = sourceFolderName + ".zip";

// Remove old output file if it exists
try {
	fs.unlinkSync(outputFileName);
} catch (ignored) {}

// Create new output zip
let zip = new Zip();
addFolder(sourceFolderName, zip);
fs.writeFileSync(outputFileName, zip.generate({base64: false, compression: 'DEFLATE'}), "binary");

// Fetches configuration file and returns it as JS object if found. Exits process if there are errors.
function fetchFolderConfig(folderName) {
	let configFileBuf;
	try {
		configFileBuf = fs.readFileSync(folderName + "/pienkuu.json", "utf8")
	} catch (e) {
		console.warn("Could not read '" + folderName + "/pienkuu.json': " + e);
		process.exit(1);
	}

	let configFile = JSON.parse(configFileBuf);
	if (!configFile) {
		console.warn("Invalid JSON in '" + folderName + "/pienkuu.json'.");
		process.exit(1);
	}

	return configFile;
}

// Adds given folder to given zip file.
// Automatically processes configuration file in the folder.
function addFolder(folderName, zip) {
	let config = fetchFolderConfig(folderName);

	// Add dependencies
	(config.dependencies || []).forEach(function(depFolderName) {
		addFolder(depFolderName, zip);
	});

	// Turn config ignore paths from local to module to local to the whole zip
	let configIgnoreFilters = (config.ignore || []).map(function(path) {
		return folderName + "/" + path;
	});

	let ignoreFilters = globalIgnoreFilters.concat(configIgnoreFilters);

	recursiveReaddirSync(folderName)
		.filter(function(path) { // filter files on the ignore list
			return ignoreFilters.every(function(filter) {
				return !minimatch(path, filter, {dot: true});
			});
		})
		.map(function(path) { // convert paths to [path, contents] tuples
			return [path, fs.readFileSync(path)];
		})
		.forEach(function(pathContentTuple) { // write tuples into the zip file
			zip.file(pathContentTuple[0], pathContentTuple[1]);
		});
}
