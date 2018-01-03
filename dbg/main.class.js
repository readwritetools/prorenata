//=============================================================================
//
// File:         fuse/src/main.class.js
// Language:     ECMAScript 2015
// Copyright:    Joe Honton © 2017
// License:      CC-BY-NC-ND 4.0
// Initial date: Dec 31, 2017
// Usage:        fuse instructionfile
//
//=============================================================================

var expect = require('joezone').expect;
var Pfile = require('joezone').Pfile;
var Bunch = require('joezone').Bunch;
var TextReader = require('joezone').TextReader;
var TextWriter = require('joezone').TextWriter;
var FileInterface = require('bluephrase').FileInterface;
var RootEntity = require('bluephrase').RootEntity;
var EntityPath = require('bluephrase').EntityPath;
var TT = require('bluephrase').TT;
var fs = require('fs');
var ChildProcess = require('child_process');

const gray    = '\x1b[90m';
const red     = '\x1b[91m';
const green   = '\x1b[92m';
const yellow  = '\x1b[93m';
const blue    = '\x1b[94m';
const nocolor = '\x1b[0m';

class log {
	static trace(msg) {
		process.stderr.write(`${gray}   [TRACE] ${nocolor}${msg}\n`);
	}
	static warning(msg) {
		process.stderr.write(`${gray} [WARNING] ${nocolor}${msg}\n`);
	}
	static abnormal(msg) {
		process.stderr.write(`${red}[ABNORMAL] ${nocolor}${msg}\n`);
	}
	static logic(msg) {
		process.stderr.write(`${red}   [LOGIC] ${nocolor}${msg}\n`);
	}
}


class Main {

	constructor() {
		this.instructionPfile = null;		// fully qualified path to the instruction file
		this.root = null;					// instruction file RootEntity
		this.commands = new Map();			// cmd (String) --> cmdTemplate (String)
		this.privateJoinChar = '|';			// use this to join and split multiple 'include' and 'exclude' params internally treated as one
		this.setup();
		Object.seal(this);
	}

	// define the builtin commands
	setup() {
		this.commands.set('template',  'builtin');
		this.commands.set('copy',    'builtin');
		this.commands.set('recurse', 'builtin');
	}

	// CLI entry point
	execute() {
		// argv[0] node
		// argv[1] main.js
		// argv[2] instructionfile
		if (process.argv.length <= 2) {
			process.stderr.write("usage: fuse instructionfile");
			return;
		}

		this.instructionPfile = new Pfile(process.argv[2]);
		this.instructionPfile.makeAbsolute();
		if (!this.instructionPfile.exists()) {
			process.stderr.write(`${instructionPfile.name} not found`);
			return;
		}
		
		this.readInstructions();
		this.processInstructions();
	}
	
	//> Read instruction file into memory, placing the hierarchy under this.root
	readInstructions() {
		expect(this.instructionPfile, 'Pfile');
		try {
			var fileInterface = new FileInterface();
			fileInterface.setOption('vocabulary', 'unchecked'); 
			this.root = fileInterface.readFile(this.instructionPfile.name);
		}
		catch (err) {
			log.abnormal(err);
		}
	}	
	
	// Loop over the root's immediate children
	processInstructions() {
		for (let i=0; i < this.root.children.length; i++) {
			
			var entity = this.root.children[i];
			var type = entity.entityType;
			
			if (type == 'GroupEntity' || type == 'StandardEntity')
				this.processCommand(entity);
			
			else if (type == 'GraynoteEntity') {
				if (entity.tokenType == TT.GRAYNOTE_COMMENT)
					log.trace(`${gray}${entity.value.trim()}${nocolor}`);
			}
			
			else if (type == 'PragmaEntity')
				continue;
			
			else
				log.logic(`Unhandled entityType ${entity.entityType}`);
		}
	}
	
	//-------------------------------------------------------------------------
	// top-level commands
	//-------------------------------------------------------------------------
	
	//> entity is a groupEntity for a builtin or user-defined command
	processCommand(entity) {
		expect(entity, ['GroupEntity', 'StandardEntity']);
		
		//> cmd is one of the builtin command, or one of the commands defined by the user inside the 'template' command
		//   template | copy | recurse
		var cmd = entity.name;
		
		if (!this.commands.has(cmd)) {
			log.warning(`The command '${cmd}' has not been defined.`);
			return;
		}
		
		var cmdTemplate = this.commands.get(cmd);
		if (cmdTemplate == 'builtin')
			this.processBuiltinCommand(cmd, entity);
		else
			this.processUserDefinedCommand(cmd, cmdTemplate, entity);
	}
	
	//> cmd is template | copy | recurse
	//> entity is a group that contains definitions (for 'template') or parameters (for 'copy' and 'recurse')
	processBuiltinCommand(cmdName, entity) {
		expect(cmdName, 'String');
		expect(entity, 'GroupEntity');
		
		switch (cmdName) {
			case 'template':
				this.processTemplateCommand(entity);
				break;
				
			case 'copy':
				this.processCopyCommand(entity);
				break;
				
			case 'recurse':
				this.processRecurseCommand(entity);
				break;
				
			default:
				log.logic(`Unhandled builtin command '${cmdName}'`);
		}
	}
	
	processUserDefinedCommand(cmdName, cmdTemplate, localEntity) {
		expect(cmdName, 'String');
		expect(cmdTemplate, 'String');
		expect(localEntity, ['GroupEntity', 'StandardEntity']);
		
		var paramMap = this.buildParameterMap(cmdName, localEntity);
		this.verifyUserParams(cmdName, paramMap);
		
		var processArgs = cmdTemplate.split(' ');		// careful: this splits the template using spaces, which may present problems when not fastidious
		var finalArgs = this.replaceParamsWithValues(processArgs, paramMap);
		this.executeChildProcess(cmdName, finalArgs);
		
		//log.trace(`${blue}${cmd}${nocolor} ${yellow}${cmdFrozen}${nocolor}`);
	}
	
	//-------------------------------------------------------------------------
	// built-in commands
	//-------------------------------------------------------------------------
	
	//^ The 'template' command
	//  children under here define new commands that are immediately available for use in subsequent instruction file lines 
	processTemplateCommand(defineEntity) {
		expect(defineEntity, 'GroupEntity');

		for (let i=0; i < defineEntity.children.length; i++) {
			var childEntity = defineEntity.children[i];
			var type = childEntity.entityType;

			if ( type == 'StandardEntity') {
				var cmdName = childEntity.name;
				var cmdTemplate = childEntity.innerText;
				this.commands.set(cmdName, cmdTemplate);
			}
			else if (type == 'PragmaEntity' || type == 'GraynoteEntity')
				continue;
			else
				log.logic(`Unhandled entity type '${type}' in processTemplate`);
		}
	}
	
	//^ The 'copy' command
	processCopyCommand(copyEntity) {
		expect(copyEntity, 'GroupEntity');
		
		var paramMap = this.buildParameterMap('copy', copyEntity);
		this.verifyBuiltinParams('copy', paramMap);

		// 'cp --preserve <source> <dest>'
		var processArgs = [
			'cp',
			'--preserve',
			'<source>',
			'<dest>'
			];
		this.beginRecursion('copy', processArgs, paramMap);
	}
	
	//^ The 'recurse' command
	processRecurseCommand(recurseEntity) {
		expect(recurseEntity, 'GroupEntity');
		
		var paramMap = this.buildParameterMap('recurse', recurseEntity);
		this.verifyBuiltinParams('recurse', paramMap);

		// The cmdTemplate for 'recurse' command is the value pointed to by the 'exec' param
		var cmdName = paramMap.get('exec').trim();
		if (!this.commands.has(cmdName)) {
			log.warning(`${blue}recurse${nocolor} ${red}<exec>${nocolor} specifies an undefined command ${red}${cmdName}${nocolor}`);
			return;
		}
		var cmdTemplate = this.commands.get(cmdName);
		expect(cmdTemplate, 'String');
		
		var processArgs = cmdTemplate.split(' ');		// careful: this splits the template using spaces, which may present problems when not fastidious

		this.beginRecursion(cmdName, processArgs, paramMap);
	}

	//> cmdName is either 'copy', or the <exec> param of a 'recurse' command
	//> processArgs is an array where [0] is the executable, and [1]..[N] are the arguments
	//> paramMap is a map of all parameter values 
	beginRecursion(cmdName, processArgs, paramMap) {
		expect(cmdName, 'String');
		expect(processArgs, 'Array'); 
		expect(paramMap,  'Map');
		
		expect(this.instructionPfile, 'Pfile');
		var path = this.instructionPfile.getPath();
		var source = new Pfile(path).addPath(paramMap.get('source'));
		var dest = new Pfile(path).addPath(paramMap.get('dest'));
	
		var includePatterns = new Array();
		if (paramMap.has('include')) {
			includePatterns = paramMap.get('include').split(this.privateJoinChar);
			expect(includePatterns, 'Array');
		}

		var excludePatterns = new Array();
		if (paramMap.has('exclude')) {
			excludePatterns = paramMap.get('exclude').split(this.privateJoinChar);
			expect(excludePatterns, 'Array');
		}

		var overwriteRule = 'never';	// set default to 'never' for safety
		if (paramMap.has('overwrite')) {
			overwriteRule = paramMap.get('overwrite');
		}

		// These params are not needed beyond this point
		paramMap.delete('exec');
		paramMap.delete('include');
		paramMap.delete('exclude');
		paramMap.delete('overwrite');
		
		this.recurseFileSystem(source, dest, cmdName, processArgs, paramMap, includePatterns, excludePatterns, overwriteRule);		
	}
	
	//> source is a Pfile of the fully qualified name at this level of recursion
	//> dest is a Pfile of the fully qualified name at this level of recursion
	//> cmdName is name pointed to by the 'exec' param
	//> processArgs is an array where [0] is the executable, and [1]..[N] are the arguments
	//> paramMap is a map of all parameter values, except 'exec', 'include', and 'exclude'
	//> includePatterns is an array of patterns of filenames that should be included in further processing
	//> excludePatterns is an array of patterns of filenames that should be excluded from further processing
	//> allowOverwrite is always | older | never
	recurseFileSystem(source, dest, cmdName, processArgs, paramMap, includePatterns, excludePatterns, overwriteRule) {
		expect(source, 'Pfile');
		expect(dest, 'Pfile');
		expect(cmdName, 'String');
		expect(processArgs, 'Array'); 
		expect(paramMap,  'Map');
		expect(includePatterns, 'Array'); 
		expect(excludePatterns, 'Array');
		
		if (source.isDirectory()) {
			if (this.isExcluded(source, cmdName, excludePatterns))
				return;

			// if 'mkdir' == true
			dest.mkDir();
			
			var bunch = new Bunch(source.name, '*', Bunch.FILE + Bunch.DIRECTORY);
			var files = bunch.find(false);
			
			for (let i=0; i < files.length; i++) {
				var basename = files[i];
				var childSource = new Pfile(source).addPath(basename);
				var childDest = new Pfile(dest).addPath(basename);
				this.recurseFileSystem(childSource, childDest, cmdName, processArgs, paramMap, includePatterns, excludePatterns, overwriteRule);
			}
		}
		else if (source.isFile()) {
			if (!this.isIncluded(source, cmdName, includePatterns))
				return;

			if (this.isExcluded(source, cmdName, excludePatterns))
				return;

			if (!this.allowOverwrite(source, dest, overwriteRule)) {
				if (overwriteRule == 'older')
					log.trace(`${blue}${cmdName}${nocolor} not overwriting because ${dest.name} ${blue}not newer than${nocolor} ${source.name}`);
				else // if (overwriteRule == 'never')
					log.trace(`${blue}${cmdName}${nocolor} not overwriting because ${dest.name} ${blue}already exists${nocolor}`);
				return;
			}
			
			paramMap.set('source', source.name);
			paramMap.set('dest', dest.name);
			var finalArgs = this.replaceParamsWithValues(processArgs, paramMap);
			this.executeChildProcess(cmdName, finalArgs);
		}
		else
			log.warning(`${blue}${cmdName}${nocolor} ${source.name} ${red}NOT FOUND${nocolor}`);
	}
	
	//> cmdName is for console feedback only
	//> finalArgs[0] is the executable filename, finalArgs[1]...[N] are the arguments
	executeChildProcess(cmdName, finalArgs) {
		expect(cmdName, 'String');
		expect(finalArgs, 'Array');

		var exeFile = finalArgs[0];
		var args = finalArgs.slice(1);
		var options = {
			cwd: this.instructionPfile.getPath()
		};
		
		try {
			log.trace(`${blue}${cmdName}${nocolor} ${yellow}${finalArgs.join(' ')}${nocolor}`);
			ChildProcess.execFileSync(exeFile, args, options);
		}
		catch(err) {
			var message = err.message
				.replace('spawnSync', "Couldn't start")
				.replace('ENOENT', '(No such file or directory)');
			log.abnormal(`${blue}${cmdName}${nocolor} ${message}`);
		}
	}
	
	//-------------------------------------------------------------------------
	// helpers
	//-------------------------------------------------------------------------
	
	//< return true if the trailing part of the path matches one of the patterns to include
	//< also returns true if there are no patterns.
	isIncluded(path, cmdName, includePatterns) {
		expect(path, 'Pfile');
		expect(cmdName, 'String');
		expect(includePatterns, 'Array');
		
		if (includePatterns.length == 0)
			return true;
		
		var filename = path.name;
		for (let i=0; i < includePatterns.length; i++) {
			var pattern = includePatterns[i]
				.replace('\\', '\\\\')		/* one solidus --> two solidus */
				.replace('^', '\\^')
				.replace('$', '\\$')
				.replace('.', '\\.')
				.replace('+', '\\+')
				.replace('(', '\\(')
				.replace(')', '\\)')
				.replace('?', '.?')			/* use a ? to match any single char */
				.replace('*', '.*');		/* use a * to match multiple chars */

			// does this user's pattern match the trailing portion of the user's path?
			var rx = new RegExp(pattern + '$');
			if (rx.test(filename))
				return true;
		}
		var joinedPatterns = includePatterns.join(', ');
		log.trace(`${blue}${cmdName}${nocolor} including ${blue}${joinedPatterns}${nocolor} does not match ${filename}`);
		return false;
	}
	
	//< return true if the trailing part of the path matches one of the patterns to exclude
	isExcluded(path, cmdName, excludePatterns) {
		expect(path, 'Pfile');
		expect(cmdName, 'String');
		expect(excludePatterns, 'Array');
		
		var filename = path.name;
		for (let i=0; i < excludePatterns.length; i++) {
			var pattern = excludePatterns[i]
				.replace('\\', '\\\\')		/* one solidus --> two solidus */
				.replace('^', '\\^')
				.replace('$', '\\$')
				.replace('.', '\\.')
				.replace('+', '\\+')
				.replace('(', '\\(')
				.replace(')', '\\)')
				.replace('?', '.?')			/* use a ? to match any single char */
				.replace('*', '.*');		/* use a * to match multiple chars */

			// does this user's pattern match the trailing portion of the user's path?
			var rx = new RegExp(pattern + '$');
			if (rx.test(filename)) {
				log.trace(`${blue}${cmdName}${nocolor} excluding ${filename} by request ${blue}${excludePatterns[i]}${nocolor}`);
				return true;
			}
		}
		return false;
	}
	
	//< returns true if the overwriteRule is 'always'
	//< returns false if the overwrite rule is 'never' and the dest exists
	//< returns true if the overwrite rule is 'older' and the dest is older than the source. 
	//< returns false if the overwrite rule is 'older' and the dest is newer or the same as the source. 
	allowOverwrite(source, dest, overwriteRule) {
		expect(source, 'Pfile');
		expect(dest, 'Pfile');
		expect(overwriteRule, 'String');
		
		if (overwriteRule == 'always')
			return true;
		
		else if (overwriteRule == 'never') {
			return !dest.exists();
		}

		else if (overwriteRule == 'older') {
			if (!dest.exists())
				return true;
			else
				return (fs.statSync(dest.name).mtime < fs.statSync(source.name).mtime);
		}
		else {
			log.logic(`Unhandled overwriteRule ${overwriteRule}`);
			return false;
		}
	}
	
	//^ Build a map of the parameters specified in the user's script, subordinate to the given group
	//> groupEntity is the parent of the parameters to be parsed
	//< returns a map of paramName (String) --> paramValue (String)
	buildParameterMap(cmd, groupEntity) {
		expect(cmd, 'String');
		expect(groupEntity, ['GroupEntity', 'StandardEntity']);

		var paramMap = new Map();
		
		// When a command is specified by the user without curly braces, it is parameterless.
		if (groupEntity.constructor.name == 'StandardEntity')
			return paramMap;

		for (let i=0; i < groupEntity.children.length; i++) {
			var paramEntity = groupEntity.children[i];
			var type = paramEntity.entityType;

			if (type == 'PragmaEntity' || type == 'GraynoteEntity')
				continue;

			// common syntax mistake is to have an unquoted value that gets interpreted by the blue-processor as a shorthand directive
			if (paramEntity.attributes.size > 0) {
				var attrPairs = Array.from(paramEntity.attributes.entries());
				for (let j=0; j < attrPairs.length; j++) {
					var key = attrPairs[j][0];
					var problematicValue = attrPairs[j][1];
						
					if (key == 'class')
						log.warning(`${blue}${cmd}${nocolor} parameter values beginning with FULL-STOP must be quoted ${red}.${problematicValue}${nocolor}`);
					else if (key == 'id')
						log.warning(`${blue}${cmd}${nocolor} parameter values beginning with HASHTAG must be quoted ${red}#${problematicValue}${nocolor}`);
					else if (key == 'style')
						log.warning(`${blue}${cmd}${nocolor} parameter values beginning with CIRCUMFLEX must be quoted ${red}^${problematicValue}${nocolor}`);
					else if (key == 'role')
						log.warning(`${blue}${cmd}${nocolor} parameter values beginning with PLUS-SIGN must be quoted ${red}+${problematicValue}${nocolor}`);
					else if (key == 'property')
						log.warning(`${blue}${cmd}${nocolor} parameter values beginning with QUESTION-MARK must be quoted ${red}?${problematicValue}${nocolor}`);
					else if (key == 'data-junctor')
						log.warning(`${blue}${cmd}${nocolor} parameter values beginning with TILDE must be quoted ${red}~${problematicValue}${nocolor}`);
					else if (key == 'sourceref' || key == 'href' || key == 'src' || key == 'data' || key == 'action' || key == 'cite') {
						const grave = '\u{0060}';
						log.warning(`${blue}${cmd}${nocolor} parameter values beginning with GRAVE-ACCENT must be quoted ${red}${grave}${problematicValue}${grave}${nocolor}`);
					}
					else {
						if (problematicValue == null)
							problematicValue = key;
						log.warning(`${blue}${cmd}${nocolor} parameter values beginning with ASTERISK must be quoted ${red}*${problematicValue}${nocolor}`);
					}
				}
			}
			
			if (type == 'StandardEntity') {
				var paramName = paramEntity.name;
				var paramValue = this.removeQuotedDelimiters(paramEntity.innerText);
				
				// handle 'include', which may legitimately be specified more than once
				if (paramName == 'include') {
					var concatValue = paramMap.has('include') ? paramMap.get('include')  + this.privateJoinChar + paramValue : paramValue;
					paramMap.set(paramName, concatValue);
				}
				// handle 'exclude', which may legitimately be specified more than once
				else if (paramName == 'exclude') {
					var concatValue = paramMap.has('exclude') ? paramMap.get('exclude')  + this.privateJoinChar + paramValue : paramValue;
					paramMap.set(paramName, concatValue);
				}
				// verify the value provided with 'overwrite'
				else if (paramName == 'overwrite') {
					if (paramValue != 'older' && paramValue != 'always' && paramValue != 'never') {
						log.warning(`${blue}${cmd}${nocolor} the <overwrite> parameter is ${red}${paramValue}${nocolor}, only ${blue}always | older | never${nocolor} are meaningful`);
					}
					paramMap.set(paramName, paramValue);
				}
				else {
					paramMap.set(paramName, paramValue);
				}
			}
			else
				log.logic(`Unhandled entity type '${type}' in buildParameterMap`);
		}
		return paramMap;
	}

	// Verify that every parameter specified by the user is needed
	//> cmd is the name of the cammand
	//> paramMap is a Map of the parameters specified by the user, in entities subordinate to the command
	verifyUserParams(cmd, paramMap) {
		expect(cmd, 'String');
		expect(paramMap, 'Map');
		
		// get the cmdTemplate
		var cmdTemplate = this.commands.get(cmd);
		expect(cmdTemplate, 'String');
		
		// are there any parameters specified by the user, but not in the template
		for (let [paramName, paramValue] of paramMap.entries()) {
			var prefixedName = `<${paramName}>`;
			if (cmdTemplate.indexOf(prefixedName) == -1)
				log.warning(`${blue}${cmd}${nocolor} does not use the parameter ${red}<${paramName}>${nocolor}, ignorning ${red}${paramValue}${nocolor}`);
		}
		
		// are there any parameters in the template that are not provided by the user
		var matches = cmdTemplate.match(/(\<.*?\>)/g);
		if (matches != null) {
			for (let i=0; i < matches.length; i++) {
				var expectedParam = matches[i].substr(1, matches[i].length-2);
				if (!paramMap.has(expectedParam)) {
					log.warning(`${blue}${cmd}${nocolor} expects a parameter named ${red}<${expectedParam}>${nocolor}`);
				}
			}
		}
	}

	// Verify that every parameter specified by the user is needed
	//> cmd is 'copy' or 'recurse'
	//> paramMap is a Map of the parameters specified by the user, in entities subordinate to the command
	verifyBuiltinParams(cmd, paramMap) {
		expect(cmd, 'String');
		expect(paramMap, 'Map');
		
		if (cmd == 'copy') {
			var requiredParams = ['source', 'dest'];
			var optionalParams = ['include', 'exclude', 'overwrite', 'onfailure'];
		}
		else if (cmd == 'recurse') {
			var requiredParams = ['source', 'exec'];
			var optionalParams = ['dest', 'include', 'exclude', 'overwrite', 'onfailure'];
		}
		else
			log.logic(`Unexpected cmd ${cmd}`);
		
		// are there any parameters specified by the user, but not required or optional
		for (let [paramName, paramValue] of paramMap.entries()) {
			if (!requiredParams.includes(paramName) && !optionalParams.includes(paramName))
				log.warning(`${blue}${cmd}${nocolor} does not use the parameter ${red}<${paramName}>${nocolor}, ignorning ${red}${paramValue}${nocolor}`);
		}
		
		// are there any required parameters that are not provided by the user
		for (let i=0; i < requiredParams.length; i++) {
			if (!paramMap.has(requiredParams[i])) {
				log.warning(`${blue}${cmd}${nocolor} expects a parameter named ${red}<${requiredParams[i]}>${nocolor}`);
			}
		}
	}

	//^ The replaceParamsWithValues function replaces parameter names with parameter values
	//< returns an array of final args, where
	//     finalArgs[0] is the executable command,
	//     <substitution> parameters are replaced with their corrects values,
	//     all other args are passed through as-is.
	replaceParamsWithValues(processArgs, paramMap) {
		expect(processArgs, 'Array');
		expect(paramMap, 'Map');

		var finalArgs = new Array();
		finalArgs.push(processArgs[0]); // the executable command

		for (let i=1; i < processArgs.length; i++) {
			var template = processArgs[i];		// like <source>
			if ((template.charAt(0) == '<') && (template.charAt(template.length-1) == '>')) { 
				var unadorned = template.substr(1, template.length-2);			// like source
				if (paramMap.has(unadorned)) {
					var replacementValue = paramMap.get(unadorned);
					finalArgs.push(replacementValue);
					continue;
				}
			}
			finalArgs.push(processArgs[i]);		// pass through as-is
		}
		return finalArgs;
	}
	
	//^ Filenames that begin with a relative path are problemmatic and must be quoted.
	//  Use this to remove the quotes
	removeQuotedDelimiters(str) {
		str = str.trim();
		var char0 = str.charAt(0);
		var charN = str.charAt(str.length-1);
		if ((char0 == charN) && (char0 == "'" || char0 == '"'))
			return str.substr(1, str.length-2);
		else
			return str;
	}
}

var main = new Main();
main.execute();
