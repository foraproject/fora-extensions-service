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
    var extensionsByModule = {};

    var ExtensionsService = function(config, baseConfig, fnModuleMapper, dynamicExtensionFinder) {
        this.config = config;
        this.baseConfig = baseConfig;
        this.fnModuleMapper = fnModuleMapper;
        this.dynamicExtensionFinder = dynamicExtensionFinder;
    };


    ExtensionsService.prototype.init = function*() {
        var self = this;

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

        var findTrustedExtensions = function*(baseDirectory, kind, modules) {
            var typeNames = yield* getSubDirectories(path.join(baseDirectory, kind));
            for(var i = 0; i < typeNames.length; i++) {
                var typeName = typeNames[i];
                var versions = yield* getSubDirectories(path.join(baseDirectory, kind, typeName));
                for(var j = 0; j < versions.length; j++) {
                    var version = versions[j];
                    for(var k = 0; k < modules.length; k++) {
                        var moduleName = modules[k];
                        var extensionName = kind + "/" + typeName + "/" + version;
                        var fullName = extensionName + "/" + moduleName;

                        var extModule = require(path.join(baseDirectory, kind, typeName, version, moduleName));
                        extModule = yield* self.fnModuleMapper(extModule, kind, typeName, version, moduleName);
                        
                        //Put the module in cache
                        moduleCache[fullName] = extModule;

                        //Add to by-extension-name directory
                        if (!extensionsByName[extensionName])
                            extensionsByName[extensionName] = {};
                        extensionsByName[extensionName][moduleName] = extModule;

                        //Add to by-type directory
                        if (!extensionsByKind[kind])
                            extensionsByKind[kind] = {};
                        extensionsByKind[kind][fullName] = extModule;

                        //Add to by-kind-and-module directory
                        if (!extensionsByModule[kind])
                            extensionsByModule[kind] = {};
                        if (!extensionsByModule[kind][moduleName])
                            extensionsByModule[kind][moduleName] = {};
                        extensionsByModule[kind][moduleName][fullName] = extModule;
                    }
                }
            }
        };

        for(var i = 0; i < this.baseConfig.locations.length; i++) {
            for(var j = 0; j < this.config.modules.length; j++) {
                _ = yield* findTrustedExtensions(
                    this.baseConfig.locations[i],
                    this.config.modules[j].kind,
                    this.config.modules[j].modules
                );
            }
        }
    };


    ExtensionsService.prototype.getModule = function*(name) {
        return moduleCache[name];
    };


    ExtensionsService.prototype.getModuleByName = function*(kind, type, version, moduleName) {
        return moduleCache[kind + "/" + type + "/" + version + "/" + moduleName];
    };


    ExtensionsService.prototype.getModulesByKind = function*(kind, moduleName) {
        return extensionsByModule[kind][moduleName];
    };


    ExtensionsService.prototype.getExtensionsByKind = function*(kind) {
        return extensionsByKind[kind];
    };


    ExtensionsService.prototype.get = function*(name) {
        var extension = extensionsByName[name];
        return {
            trusted: extension ? true : false,
            extension: extension || this.dynamicExtensionFinder(name)
        };
    };


    module.exports = ExtensionsService;

})();
