using System.Reflection;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Jellyfin.Plugin.BackgroundPlay.Controllers;

/// <summary>Sert le script client embarqué. Anonyme : il est chargé par index.html avant toute connexion.</summary>
[ApiController]
[Route(Plugin.RoutePrefix)]
public class BackgroundPlayController : ControllerBase
{
    private const string ResourceName = "Jellyfin.Plugin.BackgroundPlay." + Plugin.ScriptFileName;

    /// <summary>GET /BackgroundPlay/jellyfin-background-play.js.</summary>
    [HttpGet(Plugin.ScriptFileName)]
    [AllowAnonymous]
    public ActionResult GetScript()
    {
        var stream = Assembly.GetExecutingAssembly().GetManifestResourceStream(ResourceName);
        if (stream is null)
        {
            return NotFound();
        }

        // L'URL porte la version du plugin (?v=) : on peut cacher longtemps.
        Response.Headers["Cache-Control"] = "public, max-age=31536000, immutable";
        return new FileStreamResult(stream, "text/javascript; charset=utf-8");
    }

    /// <summary>GET /BackgroundPlay/status — version et état, pour la page de configuration.</summary>
    [HttpGet("status")]
    [Authorize(Policy = "RequiresElevation")]
    public ActionResult<object> GetStatus()
    {
        return new
        {
            version = Plugin.ScriptVersion,
            enabled = Plugin.Instance?.Configuration.Enabled ?? false,
            scriptTag = Services.ScriptInjectionStartupFilter.BuildScriptTag()
        };
    }
}
