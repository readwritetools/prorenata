//=============================================================================
//
// File:         prorenata/src/prorenata.class.js
// Language:     ECMAScript 2015
// Copyright:    Joe Honton © 2017
// License:      CC-BY-NC-ND 4.0
// Initial date: Dec 31, 2017
// Usage:        renata scriptfile
//
//=============================================================================

import {expect}			from 'joezone';
import {Pfile}			from 'joezone';
import {Bunch}			from 'joezone';
import {terminal}		from 'joezone';
import {FileInterface}	from 'bluephrase';
import {RootEntity}		from 'bluephrase';
import {EntityPath}		from 'bluephrase';
import {TT}				from 'bluephrase';
import fs				from 'fs';
import os				from 'os';
import ChildProcess 	from 'child_process';

terminal.setProcessName('[prn]');
var gray = terminal.gray;
var red = terminal.red;
var green = terminal.green;
var yellow = terminal.yellow;
var blue = terminal.blue;


export default class Prorenata {

	constructor() {
		this.instructionPfile = null;		// fully qualified path to the instruction file
		this.root = null;					// instruction file RootEntity
		this.commands = new Map();			// cmd (String) --> cmdTemplate (String)
		this.privateJoinChar = '|';			// use this to join and split multiple 'include' and 'exclude' params internally treated as one
		this.halt = false;					// halt further execution
		this.compareMiscount = 0;			// number of files that don't match in 'compare'
		this.setup();
		Object.seal(this);
	}

	// define the builtin commands
	setup() {
		this.commands.set('template','builtin');
		this.commands.set('copy',    'builtin');
		this.commands.set('recurse', 'builtin');
		this.commands.set('compare', 'builtin');
		this.commands.set('clean',   'builtin');
		this.commands.set('run',     'builtin');
	}

	// CLI entry point
	execute() {
		// argv[0] node
		// argv[1] main.js
		// argv[2] instructionfile
		if (process.argv.length <= 2)
			return;

		this.instructionPfile = new Pfile(process.argv[2]);
		this.instructionPfile.makeAbsolute();
		if (!this.instructionPfile.exists()) {
			terminal.writeToConsoleOrStderr(green(this.instructionPfile.name) + ' not found');
			return;
		}
		if (this.instructionPfile.isDirectory()) {
			terminal.writeToConsoleOrStderr(green(this.instructionPfile.name) + ' is a directory, expected an instruction file');
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
			fileInterface.setOption('vocabulary', 'unchecked');		// treat the first word of every line as 'semantax' 
			fileInterface.setOption('shorthand', 'limited'); 		// honor `sourceref` and *attribute syntax
			fileInterface.setOption('fragment');
			fileInterface.setOption('noindexmarks');
			fileInterface.setOption('nolistmarks');
			fileInterface.setOption('nocitemarks');
			fileInterface.setOption('noglossmarks');
			fileInterface.setOption('nonotemarks');
			this.root = fileInterface.readFile(this.instructionPfile.name);
		}
		catch (err) {
			terminal.abnormal(err);
		}
	}	
	
	// Loop over the root's immediate children
	processInstructions() {
		for (let i=0; i < this.root.children.length; i++) {
			
			if (this.halt == true)
				return;
			
			var entity = this.root.children[i];
			var type = entity.entityType;
			
			if (type == 'GroupEntity' || type == 'StandardEntity')
				this.processCommand(entity);
			
			else if (type == 'GraynoteEntity') {
				if (entity.tokenType == TT.GRAYNOTE_COMMENT)
					terminal.trace(gray(entity.value.trim()));
			}
			
			else if (type == 'PragmaEntity')
				continue;
			
			else
				terminal.logic('Unhandled entityType ', blue(entity.entityType));
		}
	}
	
	//-------------------------------------------------------------------------
	// top-level commands
	//-------------------------------------------------------------------------
	
	//> entity is a groupEntity for a builtin or user-defined command
	processCommand(entity) {
		expect(entity, ['GroupEntity', 'StandardEntity']);
		
		//> cmd is one of the builtin command, or one of the commands defined by the user inside the 'template' command
		//   template | copy | recurse | compare | run
		var cmd = entity.name;
		
		if (!this.commands.has(cmd)) {
			terminal.warning('The command ', blue(cmd), ' has not been defined');
			return;
		}
		
		var cmdTemplate = this.commands.get(cmd);
		if (cmdTemplate == 'builtin')
			this.processBuiltinCommand(cmd, entity);
		else
			this.processUserDefinedCommand(cmd, cmdTemplate, entity);
	}
	
	//> cmd is template | copy | recurse | run
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
				
			case 'compare':
				this.processCompareCommand(entity);
				break;
				
			case 'clean':
				this.processCleanCommand(entity);
				break;
				
			case 'run':
				this.processRunCommand(entity);
				break;
				
			default:
				terminal.logic('Unhandled builtin command ', blue(cmdName));
		}
	}
	
	//> cmdName is anything else besides: template | copy | recurse | run
	//> cmdTemplate is the command to be executed beginning with the executable filename and including all <substitution> arguments and fixed arguments
	//> localEntity is the group item that contains the user-supplied parameter values to supply to the <substitution> arguments 
	processUserDefinedCommand(cmdName, cmdTemplate, localEntity) {
		expect(cmdName, 'String');
		expect(cmdTemplate, 'String');
		expect(localEntity, ['GroupEntity', 'StandardEntity']);
		
		var paramMap = this.buildParameterMap(cmdName, localEntity);
		this.verifyUserParams(cmdName, paramMap);
		
		var processArgs = cmdTemplate.split(' ');		// careful: this splits the template using spaces, which may present problems when not fastidious
		var finalArgs = this.replaceParamsWithValues(processArgs, paramMap);
		
		var traceMsg = this.formatProgressMsg(cmdName, null, null, finalArgs, 'argsForm');
		this.executeChildProcess(cmdName, finalArgs, traceMsg, paramMap);
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
				terminal.logic('Unhandled entity type ', green(type), ' in processTemplateCommand');
		}
	}
	
	//^ The 'copy' command
	processCopyCommand(copyEntity) {
		expect(copyEntity, 'GroupEntity');
		
		var paramMap = this.buildParameterMap('copy', copyEntity);
		this.verifyBuiltinParams('copy', paramMap);

		var preserve = 'false';	// true | false†
		if (paramMap.has('preserve')) {
			preserve = paramMap.get('preserve');
			if (preserve != 'true' && preserve != 'false')
				preserve = 'false';
		}

		if (process.platform == 'darwin')
			var preserveAttr = (preserve == 'true') ? '-p' : '';	// -p preserves mode,ownership,timestamps
		else
			var preserveAttr = (preserve == 'true') ? '--preserve' : '--preserve=mode,ownership';	// --preserve=mode,ownership,timestamps

		// 'cp --preserve <source> <dest>'
		var processArgs = [
			'cp',
			preserveAttr,
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
			terminal.warning(blue('recurse '), green('<exec>'), ' specifies an undefined command ', red(cmdName));
			return;
		}
		var cmdTemplate = this.commands.get(cmdName);
		expect(cmdTemplate, 'String');
		var processArgs = cmdTemplate.split(' ');		// careful: this splits the template using spaces, which may present problems when not fastidious
		this.beginRecursion(cmdName, processArgs, paramMap);
	}

	//^ The 'compare' command
	processCompareCommand(compareEntity) {
		expect(compareEntity, 'GroupEntity');
		
		var paramMap = this.buildParameterMap('compare', compareEntity);
		this.verifyBuiltinParams('compare', paramMap);

		this.compareMiscount = 0;
		var processArgs = [];
		this.beginRecursion('compare', processArgs, paramMap);
		if (this.compareMiscount > 0)
			this.halt = true;
	}

	//^ The 'clean' command
	processCleanCommand(cleanEntity) {
		expect(cleanEntity, 'GroupEntity');
		
		var paramMap = this.buildParameterMap('clean', cleanEntity);
		this.verifyBuiltinParams('clean', paramMap);

		expect(this.instructionPfile, 'Pfile');
		var path = this.instructionPfile.getPath();

		var triggerPatterns = new Array();
		if (paramMap.has('trigger')) {
			triggerPatterns = paramMap.get('trigger').split(this.privateJoinChar);
			expect(triggerPatterns, 'Array');
		}
		else {
			this.regularTrace(blue('clean') + ' no ' + red('<trigger>') + ' parameter provided, can not continue', paramMap);
			return;
		}
		
		// make absolute, ensure that it is not a directory, ensure that it exists
		for (let i=0; i < triggerPatterns.length; i++) {
			var trigger = new Pfile(triggerPatterns[i]);
			if (!trigger.isAbsolutePath())
				trigger = new Pfile(path).addPath(triggerPatterns[i]);

			if (trigger.isDirectory()) {
				this.regularTrace(blue('clean') + red(' <trigger> ') + green(this.shortDisplayFilename(trigger.name)) + ' is a directory, expected a filename', paramMap);
				return;
			}
			
			if (!trigger.isFile()) {
				this.regularTrace(blue('clean') + red(' <trigger> ') + green(this.shortDisplayFilename(trigger.name)) + ' does not exist', paramMap);
				return;
			}
			
			this.processOneTrigger(trigger, paramMap);
		}
	}
	
	//^ The 'run' command
	//  The only recognized child are 'sh' and 'if'
	processRunCommand(runEntity) {
		expect(runEntity, 'GroupEntity');

		var paramMap = this.buildParameterMap('run', runEntity);
		this.verifyBuiltinParams('run', paramMap);

		for (let i=0; i < runEntity.children.length; i++) {
			var childEntity = runEntity.children[i];
			var type = childEntity.entityType;

			if (this.halt == true)
				return;
			
			if ( type == 'StandardEntity') {
				var shKeyword = childEntity.name;
				var shCommand = childEntity.innerText;
				if (shKeyword == 'progress' || shKeyword == 'onerror') {
					return;
				}
				// execute shell command
				else if (shKeyword == 'sh') {
					var commandArgs = shCommand.split(' ');		// careful: this splits the template using spaces, which may present problems when not fastidious

					var traceMsg = this.formatProgressMsg('run', null, null, commandArgs, 'argsForm');
					this.executeChildProcess('run', commandArgs, traceMsg, paramMap);
				}
				// conditionally execute if ... then ... else
				else if (shKeyword == 'if') {
					// parse shCommand into three commands
					var thenIndex = shCommand.indexOf('then');
					if (thenIndex == -1) {
						terminal.invalid('"if" conditional must have a "then" clause ', red(shCommand));
						return;
					}
					var ifCommand = shCommand.substr(0, thenIndex);
					var remainingCommand = shCommand.substr(thenIndex+5);
					var elseIndex = remainingCommand.indexOf('else');
					if (elseIndex != -1) {
						var thenCommand = remainingCommand.substr(0, elseIndex);
						var elseCommand = remainingCommand.substr(elseIndex+5);
					}					
					else {
						var thenCommand = remainingCommand;
						var elseCommand = null;
					}

					var commandArgs = ifCommand.split(' ');
					var traceMsg = this.formatProgressMsg('if', null, null, commandArgs, 'argsForm');
					
					// test the 'if hostname ==' or 'if hostname !=' condition
					var ifStatus = this.testIfCondition(ifCommand);
					if (ifStatus == true) {
						var commandArgs = thenCommand.split(' ');
						var traceMsg = this.formatProgressMsg('then', null, null, commandArgs, 'argsForm');
						this.executeChildProcess('then', commandArgs, traceMsg, paramMap);
					}
					else {
						if (elseCommand != null) {
							var commandArgs = elseCommand.split(' ');
							var traceMsg = this.formatProgressMsg('else', null, null, commandArgs, 'argsForm');
							this.executeChildProcess('else', commandArgs, traceMsg, paramMap);
						}
					}
				}
				else { // if (shKeyword != 'sh' && shKeyword != 'if')
					terminal.invalid(blue('run'), ' items within this command should be preceeded by ', green('sh'), ' or ', green('if'), ' ignoring ', red(shKeyword), ' ',  red(shCommand) );
					return;
				}
			}
			else if (type == 'PragmaEntity' || type == 'GraynoteEntity')
				continue;
			else
				terminal.logic('Unhandled entity type ', green(type), ' in processRunCommand');
		}
	}
	
	//-------------------------------------------------------------------------
	// 'clean' functions
	//-------------------------------------------------------------------------

	//^ 'clean' one trigger
	processOneTrigger(trigger, paramMap) {
		expect(trigger, 'Pfile');
		expect(paramMap, 'Map');
		
		// get dependents, make absolute, loop on files of directory, remove if older
		var dependentPatterns = new Array();
		if (paramMap.has('dependent')) {
			dependentPatterns = paramMap.get('dependent').split(this.privateJoinChar);
			expect(dependentPatterns, 'Array');
		}
		
		for (let j=0; j < dependentPatterns.length; j++) {
			if (dependentPatterns[j] == '') {
				this.regularTrace(blue('clean') + red(' <dependent> ') + 'is not specified', paramMap);
				return;
			}
			
			expect(this.instructionPfile, 'Pfile');
			var path = this.instructionPfile.getPath();

			var dependent = new Pfile(dependentPatterns[j]);
			if (!dependent.isAbsolutePath())
				dependent = new Pfile(path).addPath(dependentPatterns[j]);
			
			if (dependent.isDirectory()) {
				var bunch = new Bunch(dependent.name, '*', Bunch.FILE);
				var files = bunch.find(false);
				
				for (let k=0; k < files.length; k++) {
					var oneDependent = new Pfile(dependent).addPath(files[k]);
					this.removeOlder(trigger, oneDependent, paramMap);
				}
			}
			else if (dependent.isFile()) {
				this.removeOlder(trigger, dependent, paramMap);
			}
		}
	}
	
	//^ Remove a dependent file if the trigger is newer
	removeOlder(trigger, dependent, paramMap) {
		expect(trigger, 'Pfile');
		expect(dependent, 'Pfile');
		expect(paramMap, 'Map');
		
		var ow = this.compareTimestamps(trigger, dependent, 'older');
		if (ow == -400) {
			this.regularTrace(blue('clean') + ' ignoring because trigger ' + green(this.shortDisplayFilename(trigger.name)) + ' does not exist', paramMap);
		}
		else if (ow == 220) {
			this.regularTrace(blue('clean ') + green(this.shortDisplayFilename(trigger.name)) + ' triggered removal of ' + green(this.shortDisplayFilename(dependent.name)), paramMap);
			if (dependent.isFile())
				dependent.unlinkFile();
		}
	}	

	//-------------------------------------------------------------------------
	// recursion
	//-------------------------------------------------------------------------

	//> cmdName is either 'copy', 'compare', or the <exec> param of a 'recurse' command
	//> processArgs is an array where [0] is the executable, and [1]..[N] are the arguments
	//> paramMap is a map of all parameter values 
	beginRecursion(cmdName, processArgs, paramMap) {
		expect(cmdName, 'String');
		expect(processArgs, 'Array'); 
		expect(paramMap,  'Map');
		
		expect(this.instructionPfile, 'Pfile');
		var path = this.instructionPfile.getPath();
		
		// source is specified as absolute paths, or relative to the instruction file itself
		if (paramMap.has('source')) {
			var source = new Pfile(paramMap.get('source'));
			if (!source.isAbsolutePath())
				source = new Pfile(path).addPath(paramMap.get('source'));
		}
		else {
			terminal.abnormal(blue(cmdName), ' no ', red('<source>'), ' parameter provided, can not continue');
			return;
		}
		
		// dest is specified as absolute paths, or relative to the instruction file itself
		if (paramMap.has('dest')) {
			var dest = new Pfile(paramMap.get('dest'));
			if (!dest.isAbsolutePath())
				dest = new Pfile(path).addPath(paramMap.get('dest'));
		}
		else {
			// If the 'dest' parameter is not provided, use null as a signal
			// to subsequent processing to ignore anything related to a destination file.
			var dest = null;
		}
		
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

		var overwriteRule = 'never';	// always | older | never†
		if (paramMap.has('overwrite')) {
			overwriteRule = paramMap.get('overwrite');
			if (overwriteRule != 'always' && overwriteRule != 'older' && overwriteRule != 'never')
				overwriteRule = 'never';
		}

		var mkDir = (cmdName == 'compare') ? 'false' : 'true';			// default is 'false' for compare, and 'true' for others
		if (paramMap.has('mkdir')) {
			mkDir = paramMap.get('mkdir');
			if (mkDir != 'true' && mkDir != 'false')
				mkDir = 'false';
		}

		// These params are not needed beyond this point
		paramMap.delete('exec');
		paramMap.delete('include');
		paramMap.delete('exclude');
		paramMap.delete('overwrite');
		paramMap.delete('mkdir');
		
		var depth = 0;
		this.recurseFileSystem(source, dest, cmdName, processArgs, paramMap, includePatterns, excludePatterns, overwriteRule, mkDir, depth);		
	}
	
	//> source is a Pfile of the fully qualified name at this level of recursion
	//> dest is a Pfile of the fully qualified name at this level of recursion
	//> cmdName is either 'copy', 'compare', or the <exec> param of a 'recurse' command
	//> processArgs is an array where [0] is the executable, and [1]..[N] are the arguments
	//> paramMap is a map of all parameter values, except 'exec', 'include', and 'exclude'
	//> includePatterns is an array of patterns of filenames that should be included in further processing
	//> excludePatterns is an array of patterns of filenames that should be excluded from further processing
	//> overwriteRule is 'always' | 'older' | 'never'
	//> mkDir is 'true' or 'false'
	//> depth is used only to prevent infinite loop runaways
	recurseFileSystem(source, dest, cmdName, processArgs, paramMap, includePatterns, excludePatterns, overwriteRule, mkDir, depth) {
		expect(source, 'Pfile');
		expect(dest, ['Pfile', 'null']);
		expect(cmdName, 'String');
		expect(processArgs, 'Array'); 
		expect(paramMap,  'Map');
		expect(includePatterns, 'Array'); 
		expect(excludePatterns, 'Array');
		expect(overwriteRule, 'String');
		expect(mkDir, 'String');
		expect(depth, 'Number');
		
		if (this.halt == true)
			return;
		
		if (depth > 10) {
			terminal.abnormal(blue(cmdName), ' halting recursion at ', green(dest.name), ' which is 10 subdirectories deep');
			return;
		}
		
		if (source.isDirectory()) {
			if (this.isExcluded(source, cmdName, excludePatterns, paramMap))
				return;

			if (dest != null) {
				// safety check: the destination path must not be a subdirectory of the source path
				// or else we risk an infinite recursion of new deeply nested directories.
				var commonPartStart = dest.name.indexOf(source.name);
				if (commonPartStart == 0) {
					// source: appA/fused/blue
					// dest:   appA/fused/blue/subdir  <-- problem
					// dest:   appA/fused/blue2        <-- no problem
					var commonPartEnd = source.name.length;
					var firstUnmatchedChar = dest.name.charAt(commonPartEnd);
					if (firstUnmatchedChar == '/') {
						terminal.invalid(blue(cmdName), ' source path ', green(source.name), ' and destination path ', green(dest.name), ' overlap. Halting to prevent infinite loop.');
						return;
					}
				}				
				if (mkDir == 'true')
					dest.mkDir();
				if (!dest.exists()) {
					if (cmdName == 'compare') {
						terminal.trace(blue(cmdName), ' ', green(this.shortDisplayFilename(dest.name)), ' does not exist in dest');
						this.compareMiscount++;
					}
					else
						terminal.invalid(blue(cmdName), ' destination path ', green(this.shortDisplayFilename(dest.name)), ' does not exist, and ', green('mkdir'), ' is ', green('false'));
					return;
				}
			}
			
			var bunch = new Bunch(source.name, '*', Bunch.FILE + Bunch.DIRECTORY);
			var files = bunch.find(false);
			
			for (let i=0; i < files.length; i++) {
				var basename = files[i];
				var childSource = new Pfile(source).addPath(basename);
				var childDest = (dest == null) ? null : new Pfile(dest).addPath(basename);
				this.recurseFileSystem(childSource, childDest, cmdName, processArgs, paramMap, includePatterns, excludePatterns, overwriteRule, mkDir, depth +1);
			}
		}
		else if (source.isFile()) {
			if (!this.isIncluded(source, cmdName, includePatterns, paramMap))
				return;

			if (this.isExcluded(source, cmdName, excludePatterns, paramMap))
				return;

			if (dest != null) {
				// apply new filename extension to the dest, if requested
				if (paramMap.has('extension')) {
					var newExt = paramMap.get('extension');
					if (newExt.charAt(0) == '.')
						newExt = newExt.substr(1);
					dest.replaceExtension(newExt);
				}

				if (cmdName == 'compare') {
					if (!dest.exists()) {
						terminal.trace(blue(cmdName), ' ', green(this.shortDisplayFilename(source.name)), ' is in source, but ', green(this.shortDisplayFilename(dest.name)), ' is not in dest');
						this.compareMiscount++;
					}
					return; // nothing else to do here
				}

				var ow = this.compareTimestamps(source, dest, overwriteRule);
				if (ow < 0) {
					if (ow == -230)
						this.verboseTrace(blue(cmdName) + ' not overwriting because ' + green(this.shortDisplayFilename(source.name)) + blue(' same as ') + green(this.shortDisplayFilename(dest.name)), paramMap);
					else if (ow == -240)
						this.verboseTrace(blue(cmdName) + ' not overwriting because ' + green(this.shortDisplayFilename(source.name)) + blue(' older than ') + green(this.shortDisplayFilename(dest.name)), paramMap);
					else if (ow == -300)
						this.verboseTrace(blue(cmdName) + ' not overwriting because ' + green(this.shortDisplayFilename(dest.name)) + blue(' already exists'), paramMap);
					else if (ow == -400)
						this.verboseTrace(blue(cmdName) + ' ignoring because ' + green(this.shortDisplayFilename(source.name)) + blue(' does not exist'), paramMap);
					else
						terminal.logic(`compareTimestamps = ${ow}`);
					return;
				}
			}

			paramMap.set('source', source.name);
			paramMap.set('sourcepath', this.localPathOnly(source.name));
			paramMap.set('sourcefile', source.getFilename());
			if (dest != null) {
				paramMap.set('dest', dest.name);
				paramMap.set('destpath', this.localPathOnly(dest.name));
				paramMap.set('destfile', dest.getFilename());
			}
			else {
				paramMap.set('dest', '');
				paramMap.set('destpath', '');
				paramMap.set('destfile', '');
			}
			
			var finalArgs = this.replaceParamsWithValues(processArgs, paramMap);
			var traceMsg = this.formatProgressMsg(cmdName, source, dest, finalArgs, 'shortForm');
			this.executeChildProcess(cmdName, finalArgs, traceMsg, paramMap);
		}
		else
			terminal.warning(blue(cmdName), ' ', source.name, red(' NOT FOUND'));
	}
	

	//-------------------------------------------------------------------------
	// if condition
	//-------------------------------------------------------------------------
	testIfCondition(ifCommand) {
		expect(ifCommand, 'String');
		
		ifCommand = ifCommand.trim();
		terminal.trace(blue('if'), ' ', green(ifCommand));
		var parts = ifCommand.split(' ');
			
		var left  = parts[0];
		var op    = parts[1];
		var right = parts[2];
		if (left == 'hostname' && op == '==') {
			return (os.hostname() == right)
		}
		else if (left == 'hostname' && op == '!=') {
			return (os.hostname() != right)
		}
		else {
			terminal.abnormal(`Only "hostname ==" and "hostname !=" are supported`);
			return false;
		}
	}
	
	
	//-------------------------------------------------------------------------
	// child process
	//-------------------------------------------------------------------------

	//> cmdName is for console feedback: expects 'run', 'then', 'else', or one of the template-defined commands
	//> finalArgs[0] is the executable filename, finalArgs[1]...[N] are the arguments
	//> traceMsg is the progress message to send to the terminal
	//> paramMap is needed for its values: 'onerror' and 'progress'
	//< returns undefined 
	executeChildProcess(cmdName, finalArgs, traceMsg, paramMap) {
		expect(cmdName, 'String');
		expect(finalArgs, 'Array');
		expect(traceMsg, 'String');
		expect(paramMap, 'Map');

		var exeFile = finalArgs[0];
		var exePfile = new Pfile(exeFile);
		var args = finalArgs.slice(1);
		
		var options = {
			cwd: this.instructionPfile.getPath(),
			stdio: [0,1,2],
			shell: true
		};
		
		try {
			this.regularTrace(traceMsg, paramMap);
			
			var obj = ChildProcess.spawnSync(exeFile, args, options);
			
			if (obj.status != 0) {
				var onError = 'halt';
				if (paramMap.has('onerror'))
					onError = paramMap.get('onerror');
				
				var msg = (obj.error && obj.error.message) ? obj.error.message : '';
				
				if (onError == 'continue') {
					terminal.warning(blue(cmdName), ' continuing with return code ', yellow(`${obj.status}  `), yellow(msg));
				}
				else {
					terminal.error(blue(cmdName), ' halting with return code ', red(`${obj.status}  `), red(msg));
					this.halt = true;
				}
			}
		}
		catch(err) {
			
			if (err.message.indexOf('spawnSync') != -1 && err.message.indexOf('ENOENT') != -1) {
				terminal.abnormal(blue(cmdName), ' executable file not found ', blue(exeFile));
			}
			else {
	
				var message = err.message
					.replace('spawnSync', "Couldn't start")
					.replace('ENOENT', '(No such file or directory)');
				terminal.abnormal(blue(cmdName), message);
			}
			
			return false;
		}
	}
	
	//-------------------------------------------------------------------------
	// helpers
	//-------------------------------------------------------------------------
	
	//^ Format a message suitable for the terminal to show progress
	//> cmdName
	//> source may be a Pfile, or null if msgType == 'argsForm'
	//> dest   may be a Pfile, or null if msgType == 'argsForm'
	//> finalArgs may be an array, or null if msgType == 'shortForm'
	//> msgType is 'shortForm' or 'argsForm'
	formatProgressMsg(cmdName, source, dest, finalArgs, msgType) {
		expect(cmdName, 'String');
		expect(source, ['Pfile', 'null']);
		expect(dest, ['Pfile', 'null']);
		expect(finalArgs, 'Array')
		expect(msgType, 'String');
		
		if (msgType == 'shortForm') {
			if (dest == null) {
				var sourceName = this.shortDisplayFilename(source.name);
				return blue(cmdName) + ' ' + green(sourceName);
			}
			else { //if (dest != null)
				var sourceName = this.shortDisplayFilename(source.name);
				var destName = this.shortDisplayFilename(dest.name);
				return blue(cmdName) + ' ' + green(sourceName) + ' --> ' + green(destName);
			}
		}
		else if (msgType == 'argsForm') {
			var str = '';
			for (let i=0; i < finalArgs.length; i++)
				str += ' ' + finalArgs[i];
			return blue(cmdName) + green(str);
		}
		else
			terminal.logic('formatProgressMsg');
			return '';
	}
	
	//^ For terminal messages, it is desirable to shorten the filenames by removing the common leading path portion
	//> fullyQualifiedFilename
	//< shorter name
	shortDisplayFilename(fullyQualifiedFilename) {
		expect(fullyQualifiedFilename, 'String');
		
		var leadingPart = this.instructionPfile.getPath();
		if (fullyQualifiedFilename.indexOf(leadingPart) == 0)
			return fullyQualifiedFilename.substr(leadingPart.length + 1);
		
		while (leadingPart.indexOf('/') != -1) {
			var pathParts = leadingPart.split('/');
			pathParts.pop();
			leadingPart = pathParts.join('/');
			if (fullyQualifiedFilename.indexOf(leadingPart) == 0) {
				var shortName = fullyQualifiedFilename.substr(leadingPart.length);
				if (shortName.charAt(0) == '/')
					return shortName.substr(1);
				else
					return shortName;
			}
		}
		
		return fullyQualifiedFilename;
	}
	
	//^ For <sourcepath> and <destpath>, remove the common leading path portion
	//> fullyQualifiedFilename
	//< shorter name
	localPathOnly(fullyQualifiedFilename) {
		expect(fullyQualifiedFilename, 'String');
		
		var pathAndFilename = this.shortDisplayFilename(fullyQualifiedFilename);
		var pfile = new Pfile(pathAndFilename);
		var pathOnly = pfile.getPath();
		return pathOnly;
	}

	//< return true if the trailing part of the path matches one of the patterns to include
	//< also returns true if there are no patterns.
	isIncluded(path, cmdName, includePatterns, paramMap) {
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
		this.verboseTrace(blue(cmdName) + ' not including ' + green(this.shortDisplayFilename(filename)) + ' because it does not match ' + blue(joinedPatterns), paramMap);
		return false;
	}
	
	//< return true if the trailing part of the path matches one of the patterns to exclude
	isExcluded(path, cmdName, excludePatterns, paramMap) {
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
				this.verboseTrace(blue(cmdName) + ' excluding ' + green(this.shortDisplayFilename(filename)) + ' by request ' + blue(excludePatterns[i]), paramMap);
				return true;
			}
		}
		return false;
	}
	
	// Do not proceed if return value is negative
	//< returns  100 if overwrite 'always'
	//< returns  210 if overwrite 'older' and dest does not exist
	//< returns  220 if overwrite 'older' and source is newer than dest
	//< returns -230 if overwrite 'older' but source and dest have same timestamp
	//< returns -240 if overwrite 'older' but source has an older timestamp than dest
	//< returns  300 if overwrite 'never' but dest does not exist
	//< returns -300 if overwrite 'never' and dest exists
	//< returns -400 if source does not exist
	//< returns -500 on bad logic
	compareTimestamps(source, dest, overwriteRule) {
		expect(source, 'Pfile');
		expect(dest, 'Pfile');
		expect(overwriteRule, 'String');
		
		if (!source.exists())
			return -400;

		if (overwriteRule == 'always')
			return 100;
		
		else if (overwriteRule == 'older') {
			if (!dest.exists())
				return 210;
			else {
				var destTime = fs.statSync(dest.name).mtime.getTime();
				var sourceTime = fs.statSync(source.name).mtime.getTime();
				if (sourceTime > destTime)
					return 220;
				else if (sourceTime == destTime)
					return -230;
				else if (sourceTime < destTime)
					return -240;
				else {
					terminal.logic('compareTimestamps');
					return -250;
				}
			}
		}

		else if (overwriteRule == 'never') {
			return dest.exists() ? -300 : 300;
		}

		else {
			terminal.logic('Unhandled overwriteRule ', red(overwriteRule));
			return -500;
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
						terminal.warning(blue(cmd), ' parameter values beginning with FULL-STOP must be quoted ', red(problematicValue));
					else if (key == 'id')
						terminal.warning(blue(cmd), ' parameter values beginning with HASHTAG must be quoted #', red(problematicValue));
					else if (key == 'style')
						terminal.warning(blue(cmd), ' parameter values beginning with CIRCUMFLEX must be quoted ^', red(problematicValue));
					else if (key == 'role')
						terminal.warning(blue(cmd), ' parameter values beginning with PLUS-SIGN must be quoted +', red(problematicValue));
					else if (key == 'property')
						terminal.warning(blue(cmd), ' parameter values beginning with QUESTION-MARK must be quoted ?', red(problematicValue));
					else if (key == 'data-junctor')
						terminal.warning(blue(cmd), ' parameter values beginning with TILDE must be quoted ~', red(problematicValue));
					else if (key == 'sourceref' || key == 'href' || key == 'src' || key == 'data' || key == 'action' || key == 'cite') {
						const grave = '\u{0060}';
						terminal.warning(blue(cmd), ' parameter values beginning with GRAVE-ACCENT must be quoted ', red(`${grave}${problematicValue}${grave}`));
					}
					else {
						if (problematicValue == null)
							problematicValue = key;
						terminal.warning(blue(cmd), ' parameter values beginning with ASTERISK must be quoted *', red(problematicValue));
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
				// handle 'trigger', which may legitimately be specified more than once
				else if (paramName == 'trigger') {
					var concatValue = paramMap.has('trigger') ? paramMap.get('trigger')  + this.privateJoinChar + paramValue : paramValue;
					paramMap.set(paramName, concatValue);
				}
				// handle 'dependent', which may legitimately be specified more than once
				else if (paramName == 'dependent') {
					var concatValue = paramMap.has('dependent') ? paramMap.get('dependent')  + this.privateJoinChar + paramValue : paramValue;
					paramMap.set(paramName, concatValue);
				}
				// verify the value provided with 'overwrite'
				else if (paramName == 'overwrite') {
					if (paramValue != 'older' && paramValue != 'always' && paramValue != 'never') {
						terminal.warning(blue(cmd), ' the <overwrite> parameter is ', red(paramValue), ' only ', blue('always | older | never'), ' are meaningful');
					}
					paramMap.set(paramName, paramValue);
				}
				else {
					paramMap.set(paramName, paramValue);
				}
			}
			else
				terminal.logic('Unhandled entity type ', green(type), ' in buildParameterMap');
		}
		return paramMap;
	}

	// Verify that every parameter specified by the user is needed
	//> cmd is the name of the command
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
				terminal.warning(blue(cmd), ' does not use the parameter ', red(`<${paramName}>`), ' ignorning ', red(paramValue));
		}
		
		// are there any parameters in the template that are not provided by the user
		var matches = cmdTemplate.match(/(\<.*?\>)/g);
		if (matches != null) {
			for (let i=0; i < matches.length; i++) {
				var expectedParam = matches[i].substr(1, matches[i].length-2);
				if (!paramMap.has(expectedParam)) {
					terminal.warning(blue(cmd), ' expects a parameter named ', red(`<${expectedParam}>`));
				}
			}
		}
	}

	// Verify that every parameter specified by the user is needed
	//> cmd is 'copy' or 'recurse' or 'compare' or 'run'
	//> paramMap is a Map of the parameters specified by the user, in entities subordinate to the command
	verifyBuiltinParams(cmd, paramMap) {
		expect(cmd, 'String');
		expect(paramMap, 'Map');
		
		if (cmd == 'copy') {
			var requiredParams = ['source', 'dest'];
			var optionalParams = ['include', 'exclude', 'overwrite', 'mkdir', 'preserve', 'extension', 'progress', 'onerror'];
		}
		else if (cmd == 'recurse') {
			var requiredParams = ['source', 'exec'];
			var optionalParams = ['dest', 'include', 'exclude', 'overwrite', 'mkdir', 'extension', 'progress', 'onerror'];
		}
		else if (cmd == 'compare') {
			var requiredParams = ['source', 'dest'];
			var optionalParams = ['include', 'exclude', 'extension', 'onerror'];
		}
		else if (cmd == 'clean') {
			var requiredParams = ['trigger', 'dependent'];
			var optionalParams = ['progress', 'onerror'];
		}
		else if (cmd == 'run') {
			var requiredParams = [];
			var optionalParams = ['sh', 'if', 'progress', 'onerror'];
		}
		else
			terminal.logic('verifyBuiltinParams');
		
		// are there any parameters specified by the user, but not required or optional
		for (let [paramName, paramValue] of paramMap.entries()) {
			if (!requiredParams.includes(paramName) && !optionalParams.includes(paramName)) {
				if (paramName.indexOf('arg') == -1)
					terminal.warning(blue(cmd), ' does not use the parameter ', red(`<${paramName}>`), ', ignorning ', red(paramValue));
			}
		}
		
		// are there any required parameters that are not provided by the user
		for (let i=0; i < requiredParams.length; i++) {
			if (!paramMap.has(requiredParams[i])) {
				terminal.warning(blue(cmd), ' expects a parameter named ', red(`<${requiredParams[i]}>`));
			}
		}
	}

	//^ The replaceParamsWithValues function replaces parameter names with parameter values
	//> processArgs is an array of command arguments that may contain <substitution> placeholders
	//> paramMap is a map of paramName --> paramValue of the group we are working on
	//< returns an array of final args, where
	//     finalArgs[0] is the executable command,
	//     <substitution> parameters are replaced with their correct values,
	//     all other args are passed through as-is.
	replaceParamsWithValues(processArgs, paramMap) {
		expect(processArgs, 'Array');
		expect(paramMap, 'Map');

		var finalArgs = new Array();
		finalArgs.push(processArgs[0]); 								// the executable command

		for (let i=1; i < processArgs.length; i++) {
			var template = processArgs[i];								// like source
			for (let [param, value] of paramMap.entries()) {
				var substitutionVar = `<${param}>`;						// like <source>
				template = template.replace(substitutionVar, value);
			}
			finalArgs.push(template);
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
	
	//-------------------------------------------------------------------------
	// trace
	//-------------------------------------------------------------------------
	
	//> only write this message to terminal if the 'progress' parameter is 'regular' or 'verbose'
	regularTrace(traceMsg, paramMap) {
		expect(traceMsg, 'String');
		expect(paramMap, 'Map');
		
		if (paramMap.has('progress'))
			var progress = paramMap.get('progress');
		else
			var progress = 'regular';
		
		if (progress == 'regular' || progress == 'verbose')
			terminal.trace(traceMsg);
	}
	
	//> only write this message to terminal if the 'progress' parameter is 'verbose'
	verboseTrace(traceMsg, paramMap) {
		expect(traceMsg, 'String');
		expect(paramMap, 'Map');
		
		if (paramMap.has('progress'))
			var progress = paramMap.get('progress');
		else
			var progress = 'regular';
		
		if (progress == 'verbose')
			terminal.trace(traceMsg);
	}
	

}
