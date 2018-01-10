//=============================================================================
//
// File:         prorenate/src/prorenata.class.js
// Language:     ECMAScript 2015
// Copyright:    Joe Honton © 2017
// License:      CC-BY-NC-ND 4.0
// Initial date: Dec 31, 2017
// Usage:        main entry point
//
//=============================================================================

var CLI = require('./cli.class.js');
var cli = new CLI();

// Read the command line and execute
if (cli.validateOptions())
	cli.execute();
