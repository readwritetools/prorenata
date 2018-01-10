var CLI = require('./cli.class.js'), cli = new CLI();

cli.validateOptions() && cli.execute();