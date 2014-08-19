(function() {
    "use strict";

    var _;

    var thunkify = require('fora-node-thunkify'),
        fs = require('fs'),
        path = require('path');

    var readdir = thunkify(fs.readdir);
    var stat = thunkify(fs.stat);
    var readfile = thunkify(fs.readFile);

    var moduleCache = {};
    var extensionsByName = {};
    var extensionsByKind = {};

    var ExtensionsService = function(config, baseConfig) {
        this.config = config;
        this.baseConfig = baseConfig;
    };


    ExtensionsService.prototype.init = function*() {

        var getSubDirectories = function*(dir) {
            var dirs = [];
            var files = yield* readdir(dir);
            for (var i = 0; i < files.length; i++) {
                var filePath = dir + "/" + files[i];
                var entry = yield* stat(filePath);
                if (entry.isDirectory())
                    dirs.push(files[i]);
            }
            return dirs;
        };

        var findTrustedExtensions = function*(baseDirectory, extensionKind) {
            var typeNames = yield* getSubDirectories(path.join(baseDirectory, extensionKind));
            for(var i = 0; i < typeNames.length; i++) {
                var typeName = typeNames[i];
                var versions = yield* getSubDirectories(path.join(baseDirectory, extensionKind, typeName));
                for(var j = 0; j < versions.length; j++) {
                    var version = versions[j];
                    var modules = yield* getSubDirectories(path.join(baseDirectory, extensionKind, typeName, version));
                    for(var k = 0; k < modules.length; k++) {
                        var moduleName = modules[k];
                        var extensionName = extensionKind + "/" + typeName + "/" + version;
                        var fullName = extensionName + "/" + moduleName;
                        var extModule = require(path.join(baseDirectory, extensionKind, typeName, version, moduleName));
                        _ = yield* extModule.init();

                        //Put the module in cache
                        moduleCache[fullName] = extModule;

                        //Add to by-extension-name directory
                        if (!extensionsByName[extensionName])
                            extensionsByName[extensionName] = {};
                        extensionsByName[extensionName][moduleName] = extModule;

                        //Add to by-type directory
                        if (!extensionsByKind[extensionKind])
                            extensionsByKind[extensionKind] = {};
                        extensionsByKind[extensionKind][fullName] = extModule;
                    }
                }
            }
        };

        for(var i = 0; i < this.baseConfig.locations.length; i++) {
            for(var j = 0; j < this.config.types.length; j++) {
                _ = yield* findTrustedExtensions(this.baseConfig.locations[i], this.config.types[j]);
            }
        }
    };



    ExtensionsService.prototype.getModule = function*(name) {
        return moduleCache[name];
    };


    ExtensionsService.prototype.getUntrustedModule = function*(name) {
        throw new Error("Untrusted module " + name + " cannot be loaded");
    };


    ExtensionsService.prototype.getExtensionByName = function*(kind, type, version) {
        return extensionsByName[kind + "/" + type + "/" + version];
    };


    ExtensionsService.prototype.getUntrustedExtensionByName = function*(kind, type, version) {
        throw new Error("Untrusted Extension " + kind + "/" + type + "/" + version + " cannot be loaded");
    };


    ExtensionsService.prototype.getExtensionsByKind = function*(kind) {
        return extensionsByKind[kind];
    };


    ExtensionsService.prototype.getUntrustedExtensionsByKind = function*(kind) {
        throw new Error("Untrusted extensions of kind " + kind + " cannot be loaded");
    };


    module.exports = ExtensionsService;

})();
