var path = require('path');
var fs = require('fs');
var EOL = require('os').EOL;

var through = require('through2');
var gutil = require('gulp-util');
var rev = require('gulp-rev');

module.exports = function (options) {
	options = options || {}; // cssmin, htmlmin, jsmin

	var startReg = /<!--\s*build:(css|js)(?:\(([^\)]+?)\))?\s+(\/?([^\s]+?))\s*-->/gim;
	var endReg = /<!--\s*endbuild\s*-->/gim;
	var jsReg = /<\s*script\s+.*?src\s*=\s*"([^"]+?)".*?><\s*\/\s*script\s*>/gi;
	var cssReg = /<\s*link\s+.*?href\s*=\s*"([^"]+)".*?>/gi;
	var basePath, mainPath, mainName, alternatePath;
	var filesCount = 0;

	function createFile(name, content, asset) {
		var filepath = path.join(path.relative(basePath, mainPath), name)

		if (asset === true && options.assetsDir)
		{
			filepath = path.relative(basePath,path.join(options.assetsDir,filepath));
		}

		return new gutil.File({
			path: filepath,
			contents: new Buffer(content)
		});
	}

	function concat(content, reg, delimiter) {
		var paths = [];
		var buffer = [];

		content
			.replace(/<!--(?:(?:.|\r|\n)*?)-->/gim, '')
			.replace(reg, function (a, b) {
				paths.push(path.resolve(path.join(alternatePath || mainPath, b)));
			});

		for (var i = 0, l = paths.length; i < l; ++i)
			buffer.push(fs.readFileSync(paths[i]));

		return buffer.join(delimiter);
	}

	function write(files, processor, callback) {
		if (processor) {
			processor.on('data', callback);

			files.forEach(function(file) {
				processor.write(file);
			});

			processor.removeListener('data', callback);
		}
		else
			files.forEach(callback);
	}

	function processHtml(content, callback) {
		var html = [];
		var jsFiles = [];
		var cssFiles = [];
		var sections = content.split(endReg);

		for (var i = 0, l = sections.length; i < l; ++i)
			if (sections[i].match(startReg)) {
				var section = sections[i].split(startReg);
				alternatePath = section[2];

				html.push(section[0]);

				if (section[1] == 'js') {
					var newFile = createFile(section[4], concat(section[5], jsReg, ';' + EOL + EOL), true);
					if (options.rev === true)
					{
						var stream = rev();
						stream.write(newFile);
						stream.end();
						html.push('<script src="' + section[3].replace(path.basename(section[3]), path.basename(newFile.path)) + '"></script>');
					}
					else
					{
						html.push('<script src="' + section[3] + '"></script>');
					}

					jsFiles.push(newFile);
					filesCount++;
				}
				else
				{
					var newFile = createFile(section[4], concat(section[5], cssReg, EOL + EOL), true);

					if (options.rev === true)
					{
						var stream = rev();
						stream.write(newFile);
						stream.end();
						html.push('<link rel="stylesheet" href="' + section[3].replace(path.basename(section[3]), path.basename(newFile.path)) + '"/>');
					}
					else
					{
						html.push('<link rel="stylesheet" href="' + section[3] + '"/>');
					}

					cssFiles.push(newFile);
					filesCount++;
				}
			}
			else
				html.push(sections[i]);

			write(jsFiles, options.jsmin, callback);
			write(cssFiles, options.cssmin, callback);
			write([createFile(mainName, html.join(''))], options.htmlmin, callback);
	}

	return through.obj(function (file, enc, callback) {
		if (file.isNull()) {
			this.push(file); // Do nothing if no contents
			callback();
		}
		else if (file.isStream()) {
			this.emit('error', new gutil.PluginError('gulp-usemin', 'Streams are not supported!'));
			callback();
		}
		else {
			basePath = file.base;
			mainPath = path.dirname(file.path);
			mainName = path.basename(file.path);

			filesCount = 1;
			processHtml(String(file.contents), function(file) {
				this.push(file);
				filesCount--;

				if (filesCount <= 0)
					callback();
			}.bind(this));
		}
	});
};
