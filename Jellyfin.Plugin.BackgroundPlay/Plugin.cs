using System.Globalization;
using System.Reflection;
using Jellyfin.Plugin.BackgroundPlay.Configuration;
using MediaBrowser.Common.Configuration;
using MediaBrowser.Common.Plugins;
using MediaBrowser.Model.Plugins;
using MediaBrowser.Model.Serialization;

namespace Jellyfin.Plugin.BackgroundPlay;

/// <summary>
/// Jellyfin Background Play : quitter le lecteur vidéo web ne coupe plus la vidéo, elle continue
/// en fond avec une mini barre de lecture (la même que pour la musique).
/// Le script client (jellyfin-background-play.js) est embarqué dans la DLL, servi par
/// <see cref="Controllers.BackgroundPlayController"/> et injecté dans index.html à la volée par
/// <see cref="Services.ScriptInjectionStartupFilter"/>. Rien n'est écrit sur le disque.
/// </summary>
public class Plugin : BasePlugin<PluginConfiguration>, IHasWebPages
{
    /// <summary>Nom du fichier script tel qu'exposé par l'API du plugin.</summary>
    public const string ScriptFileName = "jellyfin-background-play.js";

    /// <summary>Segment de route de l'API du plugin.</summary>
    public const string RoutePrefix = "BackgroundPlay";

    public Plugin(IApplicationPaths applicationPaths, IXmlSerializer xmlSerializer)
        : base(applicationPaths, xmlSerializer)
    {
        Instance = this;
    }

    public static Plugin? Instance { get; private set; }

    public override string Name => "Jellyfin Background Play";

    public override Guid Id => Guid.Parse("03de372b-6a0e-4c93-a525-05e094642af6");

    public override string Description =>
        "Quitter le lecteur vidéo web ne coupe plus la vidéo : elle continue en fond avec une mini barre de lecture, comme la musique. "
        + "Leaving the web video player no longer stops the video: it keeps playing with a mini player bar, just like music.";

    /// <summary>Version du plugin, utilisée pour le cache-busting de l'URL du script.</summary>
    public static string ScriptVersion { get; } =
        (Assembly.GetExecutingAssembly().GetName().Version ?? new Version(0, 0, 0, 0)).ToString(3);

    /// <inheritdoc />
    public IEnumerable<PluginPageInfo> GetPages()
    {
        yield return new PluginPageInfo
        {
            Name = Name,
            EmbeddedResourcePath = string.Format(CultureInfo.InvariantCulture, "{0}.Configuration.configPage.html", GetType().Namespace)
        };
    }
}
