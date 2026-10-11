using MediaBrowser.Model.Plugins;

namespace Jellyfin.Plugin.BackgroundPlay.Configuration;

/// <summary>Configuration du plugin (Tableau de bord → Plugins → Jellyfin Background Play).</summary>
public class PluginConfiguration : BasePluginConfiguration
{
    /// <summary>
    /// Injecter le script dans le client web. Décocher rend au lecteur son comportement d'origine sans désinstaller le plugin
    /// (prise en compte à la prochaine (re)charge de la page web, sans redémarrage).
    /// </summary>
    public bool Enabled { get; set; } = true;
}
