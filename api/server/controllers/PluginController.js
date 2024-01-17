const { promises: fs } = require('fs');
const { CacheKeys } = require('librechat-data-provider');
const { addOpenAPISpecs } = require('~/app/clients/tools/util/addOpenAPISpecs');
const { getLogStores } = require('~/cache');

const filterUniquePlugins = (plugins) => {
  const seen = new Set();
  return plugins.filter((plugin) => {
    const duplicate = seen.has(plugin.pluginKey);
    seen.add(plugin.pluginKey);
    return !duplicate;
  });
};

const isPluginAuthenticated = (plugin) => {
  if (!plugin.authConfig || plugin.authConfig.length === 0) {
    return false;
  }

  return plugin.authConfig.every((authFieldObj) => {
    const envValue = process.env[authFieldObj.authField];
    if (envValue === 'user_provided') {
      return false;
    }
    return envValue && envValue.trim() !== '';
  });
};

const getAvailablePluginsController = async (req, res) => {
  try {
    const cache = getLogStores(CacheKeys.CONFIG_STORE);
    const cachedPlugins = await cache.get(CacheKeys.PLUGINS);
    if (cachedPlugins) {
      res.status(200).json(cachedPlugins);
      return;
    }

    const pluginManifest = await fs.readFile(req.app.locals.paths.pluginManifest, 'utf8');

    const jsonData = JSON.parse(pluginManifest);
    /** @type {TPlugin[]} */
    const uniquePlugins = filterUniquePlugins(jsonData);
    const authenticatedPlugins = uniquePlugins.map((plugin) => {
      if (isPluginAuthenticated(plugin)) {
        return { ...plugin, authenticated: true };
      } else {
        return plugin;
      }
    });
    const plugins = await addOpenAPISpecs(authenticatedPlugins);
    await cache.set(CacheKeys.PLUGINS, plugins);
    res.status(200).json(plugins);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * Retrieves and returns a list of available tools, either from a cache or by reading a plugin manifest file.
 *
 * This function first attempts to retrieve the list of tools from a cache. If the tools are not found in the cache,
 * it reads a plugin manifest file, filters for unique plugins, and determines if each plugin is authenticated.
 * Only plugins that are marked as available in the application's local state are included in the final list.
 * The resulting list of tools is then cached and sent to the client.
 *
 * @param {object} req - The request object, containing information about the HTTP request.
 * @param {object} res - The response object, used to send back the desired HTTP response.
 * @returns {Promise<void>} A promise that resolves when the function has completed.
 */
const getAvailableTools = async (req, res) => {
  try {
    const cache = getLogStores(CacheKeys.CONFIG_STORE);
    const cachedTools = await cache.get(CacheKeys.TOOLS);
    if (cachedTools) {
      res.status(200).json(cachedTools);
      return;
    }

    const pluginManifest = await fs.readFile(req.app.locals.paths.pluginManifest, 'utf8');

    const jsonData = JSON.parse(pluginManifest);
    /** @type {TPlugin[]} */
    const uniquePlugins = filterUniquePlugins(jsonData);

    const authenticatedPlugins = uniquePlugins.map((plugin) => {
      if (isPluginAuthenticated(plugin)) {
        return { ...plugin, authenticated: true };
      } else {
        return plugin;
      }
    });

    const tools = authenticatedPlugins.filter(
      (plugin) => req.app.locals.availableTools[plugin.pluginKey] !== undefined,
    );

    await cache.set(CacheKeys.TOOLS, tools);
    res.status(200).json({ tools });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getAvailableTools,
  getAvailablePluginsController,
};
