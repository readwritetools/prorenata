//=============================================================================
//
// File:         prorenata/src/cli.class.js
// Language:     ECMAScript 2015
// Copyright:    Joe Honton © 2018
// License:      CC-BY-NC-ND 4.0
// Initial date: Jan 10, 2018
// Contents:     Command line interface
//
//=============================================================================

import {expect}			from 'joezone';
import {terminal}		from 'joezone';
import {Pfile}			from 'joezone';
import Prorenata  		from './prorenata.class';
import fs				from 'fs';

export default class CLI {
	
    constructor() {
		Object.seal(this);
    }
    
    //^ Check to see if all the necessary command line arguments are present and valid
	// argv[0] node
	// argv[1] main.js
	// argv[2] instructionfile or --option
    //< returns false to prevent actual execution
    validateOptions() {
    	
    	if (process.argv.length == 2)
    		this.usageAndExit();
    	
    	switch (process.argv[2]) {
	    	case '--version':
	    		this.exit(this.showVersion());
	    		return false;
	    		
	    	case '--syntax':
	    		this.exit(this.listSyntax());
	    		return false;
	    		
	    	case '--commands':
	    		this.exit(this.listCommands());
	    		return false;
	    		
	    	case '--parameters':
	    		this.exit(this.listParameters());
	    		return false;
	    		
	    	case '--examples':
	    		this.exit(this.listExamples());
	    		return false;
	    		
	    	case '--help':
	    		this.exit(this.listHelp());
	    		return false;
	    		
	    	default:
	    		return true;
    	}
    }
    
    usageAndExit() {
		var s = [];
		s.push("usage: prn [scriptfile] [options]");
		s.push("");
		s.push("options:");
		s.push("    --version");
		s.push("    --syntax     explains the prorenata syntax");
		s.push("    --commands   list the builtin commands");
		s.push("    --parameters list the builtin command parameters");
		s.push("    --examples   show examples of p.r.n. scriptfiles");
		s.push("    --help       show prorenata syntax, commands, parameters");
		this.exit(s.join("\n"));
    }
    
    showVersion() {
    	try {
    		var packageFile = new Pfile(__dirname).addPath('../package.json').name;
	    	var contents = fs.readFileSync(packageFile, 'utf-8');
	    	var obj = JSON.parse(contents);
	    	return `version v${obj.version}`;
    	}
    	catch (err) {
    		return `version unknown ${err.message}`;
    	}
    }

    listSyntax() {
		var s = [];
		s.push("Syntax: script files contain commands in this form:");
		s.push("");
		s.push("command {");
		s.push("   parameter value");
		s.push("}");
		return s.join("\n")
    }
    
    listCommands() {
		var s = [];
		s.push("commands := template | recurse | compare| copy | run");
		s.push("   'template'  defines new commands for use with the <exec> parameter of 'recurse'");
		s.push("   'recurse'   runs a template-defined command recursively over all files in <source>");
		s.push("   'compare'   lists files that are in <source> but not in <dest>");
		s.push("   'copy'      recursively copies all files in <source> to <dest>");
		s.push("   'run'       executes an arbitrary shell command");
		return s.join("\n")
    }
    
    listParameters() {
		var s = [];
		s.push("'recurse'  parameters := source* | exec* | include | exclude | extension | overwrite | mkdir | progress | dest | onerror");
		s.push("'compare'  parameters := source* | dest* | include | exclude | extension | onerror");
		s.push("'copy'     parameters := source* | dest* | include | exclude | extension | overwrite | mkdir | progress | onerror");
		s.push("'run'      parameters := sh* | progress | onerror");
		s.push("'template' has definitions (not parameters) for use with the <exec> parameter of a 'recurse' command");
		s.push("");
		s.push("parameters :=");
		s.push("   <source>    an absolute or relative path");
		s.push("   <dest>      an absolute or relative path");
		s.push("   <include>   a file pattern to include, if omitted defaults to '*'");
		s.push("   <exclude>   a file pattern to exclude");
		s.push("   <extension> the filename extension to apply to destination filenames");
		s.push("   <exec>      a command name defined in the 'template' section");
		s.push("   <overwrite> := always | older | never†");
		s.push("   <mkdir>     := true | false†");
		s.push("   <progress>  := verbose | regular† | none");
		s.push("   <onerror>   := continue | halt†");
		s.push("   <sh>        a shell command to execute");
		s.push("");
		s.push("* required parameter");
		s.push("† optional parameter default value");
		return s.join("\n")
    }

    listExamples() {
		var s = [];
		s.push("Sample using 'copy' to recursively copy files with *.html extension from 'foo' to 'bar'");
		s.push("");
		s.push("copy {");
		s.push("   source  foo");
		s.push("   dest    bar");
		s.push("   include '*.html'");
		s.push("}");
		s.push("");
		s.push("Sample using 'template' and 'recurse' to compile LESS into CSS from 'foo' to 'bar'");
		s.push("template {");
		s.push("   compile-css lessc <source> <dest>");
		s.push("}");
		s.push("recurse {");
		s.push("   source    foo");
		s.push("   dest      bar");
		s.push("   include   '*.less'");
		s.push("   extension '.css'");
		s.push("   exec      compile-css");
		s.push("}");
		s.push("");
		s.push("Sample using 'template' and user-defined command to count the number of files in 'foo' with an 'html' extension");
		s.push("template {");
		s.push("   count-by-ext ls -l <path> | grep <ext> | wc -l");
		s.push("}");
		s.push("count-by-ext {");
		s.push("   path      foo");
		s.push("   ext       html");
		s.push("}");
		return s.join("\n")
    }

    listHelp() {
		var s = [];
		s.push("");
		s.push("usage: prn [scriptfile] [options]");
		s.push("");
		s.push( this.listSyntax() );
		s.push("");
		s.push( this.listCommands() );
		s.push("");
		s.push( this.listParameters() );
		s.push("");
		s.push( this.listExamples() );
		return s.join("\n")
    }
    
    exit(message) {
		terminal.writeToConsoleOrStderr("\nProrenata recursively operates on paths running commands only when necessary\n");
		terminal.writeToConsoleOrStderr(message + "\n");
		process.exit(0);
    
    }

    execute() {
	    var prorenata = new Prorenata();
	    prorenata.execute();
    }

}
