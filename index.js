"use strict";

// Requires
let Promise = require("bluebird");
let fs = require('fs');
let path = require('path');
let minimatch = require("minimatch");
let Zip = require('node-zip');
let recursiveReaddirSync = require('recursive-readdir-sync');
let luamin = require('luamin');

// Command line arguments
let argv = require('minimist')(process.argv.slice(2));

// Configuration
let globalIgnoreFilters = [
	"*/.git/**",
	"*/pienkuu.json"
];
let isVerbose = argv.v == true;

let sourceFolderName = argv._[0];
if (!sourceFolderName) {
	console.warn("Please provide a folder name as the first argument.");
	process.exit(1);
}

let outputFileName = sourceFolderName + ".zip";

// IMPLEMENTATION

// Remove old output file if it exists
try {
	fs.unlinkSync(outputFileName);
} catch (ignored) {}

// Create new output zip
let zip = new Zip();
addFolder(sourceFolderName, zip)
	.then(function() { // we're done! write the zip file
		if (isVerbose) console.log("Done! Writing zip buffer to output file '" + outputFileName + "'.")
		fs.writeFileSync(outputFileName, zip.generate({base64: false, compression: 'DEFLATE'}), "binary");
	}, function(e) { // something failed; abort
		console.warn(e);
		process.exit(1);
	});

// Fetches configuration file and returns it as JS object if found. Exits process if there are errors.
function fetchFolderConfig(folderName) {
	let readFilePromise = Promise.promisify(fs.readFile);
	return readFilePromise(folderName + "/pienkuu.json", "utf8").then(function(str) {
		return JSON.parse(str);
	});
}

// Adds given folder to given zip file.
// Automatically processes configuration file in the folder.
function addFolder(folderName, zip) {
	let config;
	return fetchFolderConfig(folderName).then(function(_config) {
		if (isVerbose) console.log("Fetched configuration for folder '" + folderName + "'");

		config = _config;

		// Add dependencies
		return Promise.all(
			(config.dependencies || []).map(function(depFolderName) {
				return addFolder(depFolderName, zip);
			})
		);
	}).then(function(deps) {
		// Turn config ignore paths from local to module to local to the whole zip
		let configIgnoreFilters = (config.ignore || []).map(function(path) {
			return folderName + "/" + path;
		});

		let ignoreFilters = globalIgnoreFilters.concat(configIgnoreFilters);

		// (White)list of items that will be linted/minified. Again turned into local to whole zip paths
		let lintList = (config.lint || []).map(function(path) {
			return folderName + "/" + path;
		});
		let minifyList = (config.minify || []).map(function(path) {
			return folderName + "/" + path;
		});

		// List of actions that should be executed after processing folder files
		let actionList = (config.actions || []);

		recursiveReaddirSync(folderName)
			.filter(function(path) { // filter files on the ignore list
				return ignoreFilters.every(function(filter) {
					return !minimatch(path, filter, {dot: true});
				});
			})
			.map(function(path) { // convert paths to [path, contents] tuples
				let lint = lintList.some(function(filter) { return minimatch(path, filter); });
				let minify = minifyList.some(function(filter) { return minimatch(path, filter); });

				let contents;
				if (lint || minify) {
					let contentsUTF = fs.readFileSync(path, "utf8");

					if (lint) lintLuaFile(path);
					if (minify) contentsUTF = luamin.minify(contentsUTF);

					contents = new Buffer(contentsUTF);
				} else {
					contents = fs.readFileSync(path);
				}

				return [path, contents];
			})
			.forEach(function(pathContentTuple) { // write tuples into the zip file
				zip.file(pathContentTuple[0], pathContentTuple[1]);
			});

		return Promise.each(actionList, function(action) {
			// action is an array where first value is a string identifier and second is object of options
			let actionName = action[0];
			let actionOpts = action[1] || {};
			return applyAction(actionName, actionOpts, {
				folderName: folderName,
				zip: zip,
				config: config
			});
		});
	});
}

function lintLuaFile(path) {
	let spawn = require('child_process').spawn;
	let linter = spawn('external/glualint.exe', [path]);

	function printData(data) {
		data.toString('UTF-8')
		.split('\n')
		.filter(function(line) { return line.trim() != "";  })
		.forEach(function(line) {
			console.log("glualint: " + line.trim());
		})
	}

	linter.stdout.on('data', printData);
	linter.stderr.on('data', printData);
}

function formatTemplateString(str) {
	let buildDate = new Date();

	return str
		.replace('{builddate}', buildDate.getFullYear() + '-' + (1 + buildDate.getMonth()) + '-' + buildDate.getDate());
}

function applyAction(name, actionOpts, opts) {
	if (name == "print") {
		return new Promise(function(resolve) {
			console.log(opts.folderName + ": " + actionOpts.text);
			resolve();
		});
	} else if (name == "download") {
		return new Promise(function(resolve) {
			let needle = require('needle');

			if (isVerbose) console.log("Downloading from url '" + actionOpts.url + "'");

			needle.get(actionOpts.url, {follow: 3, decode: false, parse: false}, function(error, response) {
				// convert to folder-relative path
				let fullPath = opts.folderName + '/' + formatTemplateString(actionOpts.target);

				if (fullPath.endsWith('/')) { // is a folder
					let fileName = path.basename(actionOpts.url);
					fullPath = fullPath + fileName;
				}

				opts.zip.file(fullPath, response.body);

				if (isVerbose) console.log("Download complete");
				resolve();
			});
		});
	} else if (name == "create-file") {
		return new Promise(function(resolve) {
			let formattedTarget = formatTemplateString(actionOpts.target);
			let formattedContents = formatTemplateString(actionOpts.content || '');

			let fullPath = opts.folderName + '/' + formattedTarget;
			if (isVerbose) console.log("Creating file at " + fullPath);

			opts.zip.file(fullPath, formattedContents);

			if (isVerbose) console.log("File creation complete.");

			resolve();
		});
	} else if (name == "copy") {
		return new Promise(function(resolve) {
			let fileFrom = opts.folderName + '/' + actionOpts.from;
			let fileTo = formatTemplateString(actionOpts.to);

			let copyToRoot = !!actionOpts.toRoot;

			let fullPath = copyToRoot ? fileTo : (opts.folderName + '/' + fileTo);

			if (!!actionOpts.recursive) {
				if (isVerbose) console.log("Recursive copying " + fileFrom + " to zip-path " + fullPath);

				recursiveReaddirSync(fileFrom)
					.filter(function(path) {
						return true;
						//return !minimatch(path, actionOpts.from, {dot: true});
					})
					.forEach(function(rpath) {
						let fpath = path.relative(fileFrom, rpath);
						let zipPath = fullPath == '' ? fpath : (fullPath + '/' + fpath);

						if (isVerbose) console.log("Copying " + fpath + " -> " + zipPath);

						zip.file(zipPath, fs.readFileSync(rpath));
					});
			} else {
				if (isVerbose) console.log("Copy file " + fileFrom + " to zip-path " + fullPath);
				let contents = fs.readFileSync(fileFrom, {"encoding": "utf8"});
				opts.zip.file(fullPath, contents);
			}

			if (isVerbose) console.log("Copying complete.");

			resolve();
		});
	} else {
		return Promise.reject("Invalid action name '" + name + "' in '" + opts.folderName + "/pienkuu.json': no handler for action found.");
	}
}
