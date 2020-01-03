//=============================================================================
//
// File:         prorenata/src/main.js
// Language:     ECMAScript 2015
// Copyright:    Read Write Tools © 2018
// License:      MIT
// Initial date: Dec 31, 2017
// Usage:        main entry point
//
//=============================================================================

import CLI from './cli.class.js';
var cli = new CLI();

// Read the command line and execute
if (cli.validateOptions())
	cli.execute();
