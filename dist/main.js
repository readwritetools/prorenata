/* Copyright (c) 2018 Read Write Tools */
var CLI = require('./cli.class.js'), cli = new CLI();

cli.validateOptions() && cli.execute();