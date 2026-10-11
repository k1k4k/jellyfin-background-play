/*!
 * Jellyfin Background Play — v0.1.0
 * https://github.com/k1k4k/jellyfin-background-play
 *
 * Quitter le lecteur vidéo web (flèche retour, touche Échap, retour du
 * navigateur) ne coupe plus la vidéo : elle continue en fond et une mini barre
 * de lecture, la même que pour la musique, apparaît en bas de l'écran. Un clic
 * sur la barre ramène au lecteur. Pour arrêter : bouton Stop (carré) à côté de
 * pause, dans le lecteur comme dans la barre, ou la croix en haut à droite du
 * lecteur.
 *
 * Leaving the web video player (back arrow, Escape, browser back) no longer
 * stops the video: it keeps playing and the same mini "now playing" bar as for
 * music shows up at the bottom. Click the bar to get back to the player. To
 * stop: the Stop (square) button next to pause, in the player and in the bar,
 * or the cross at the top right of the player.
 *
 * Pour les autres plugins : la barre a un emplacement .jfBgBarExtra (à droite, avant
 * « revenir au lecteur ») où ajouter des boutons ; <html> porte .jfBgBarShown quand elle est
 * affichée ; playbackManager.play({ …, jfBackgroundPlay: 'keep' }) change de vidéo sans
 * quitter le mode barre.
 *
 * Cible / target : jellyfin-web 10.11+ (développé et testé sur 12.1.0).
 * Aucune modification du bundle : le playbackManager et l'appRouter internes
 * sont retrouvés via le runtime webpack, en cherchant les modules par leur
 * contenu (pas par ID).
 *
 * Licence MIT.
 */
(function () {
    'use strict';

    if (window.__jfBackgroundPlay) return;
    var VERSION = '0.1.0';
    window.__jfBackgroundPlay = { version: VERSION };

    var TAG = '[BackgroundPlay]';
    var pm = null;              // playbackManager (singleton)
    var router = null;          // appRouter (singleton), facultatif
    var origStop = null;        // pm.stop d'origine
    var origShowVideoOsd = null; // router.showVideoOsd d'origine
    var setBackdropTransparency = null; // backdrop.setBackdropTransparency, facultatif

    // Mode « fond » : la vidéo joue alors que le lecteur n'est plus affiché.
    var mini = false;
    // Le viewbeforehide de la page du lecteur est en cours : le stop qui suit vient
    // de la page qui se ferme (onViewHideStopPlayback de jellyfin-web), on l'ignore.
    var hidingOsd = false;
    // La page affichée accepte la barre de lecture (option enableMediaControl de la vue).
    var mediaControlAllowed = true;
    var bar = null;             // éléments de la mini barre, créés à la demande
    var pollTimer = null;
    var lastItemId = null;
    var osdObserver = null;
    // Entre deux vidéos de la file (épisode suivant), plus rien ne joue pendant le chargement :
    // on reste en fond jusqu'au playbackstart suivant (ou jusqu'à cette échéance).
    var switchingUntil = 0;
    // Lecture lancée avec { jfBackgroundPlay: 'keep' } : l'arrêt de la vidéo remplacée ne
    // fait pas sortir du mode fond (son playbackstop n'annonce pas forcément une vidéo ensuite).
    var keepThroughStop = false;

    /* ------------------------------------------------------------------ */
    /*  0. Textes FR / EN                                                  */
    /* ------------------------------------------------------------------ */

    var STRINGS = {
        fr: { play: 'Lecture', pause: 'Pause', stop: 'Arrêter', previous: 'Précédent', next: 'Suivant',
              mute: 'Couper le son', unmute: 'Rétablir le son', openPlayer: 'Revenir au lecteur', close: 'Fermer le lecteur' },
        en: { play: 'Play', pause: 'Pause', stop: 'Stop', previous: 'Previous', next: 'Next',
              mute: 'Mute', unmute: 'Unmute', openPlayer: 'Back to player', close: 'Close player' }
    };

    function getLang() {
        var l = (document.documentElement.lang || navigator.language || 'en').toLowerCase();
        return l.indexOf('fr') === 0 ? 'fr' : 'en';
    }

    function t(key) {
        var lang = getLang();
        return (STRINGS[lang] && STRINGS[lang][key]) || STRINGS.en[key] || key;
    }

    /* ------------------------------------------------------------------ */
    /*  1. Modules internes via le runtime webpack                         */
    /* ------------------------------------------------------------------ */

    function getWebpackRequire() {
        return new Promise(function (resolve) {
            var chunks = (self.webpackChunk = self.webpackChunk || []);
            // Le runtime appelle le 3e argument avec __webpack_require__.
            // Si le runtime n'est pas encore chargé, le push est rejoué à son chargement.
            chunks.push([['jfBackgroundPlay_' + Date.now()], {}, function (req) { resolve(req); }]);
        });
    }

    var scannedModules = {};

    function allFound() {
        return pm && router && setBackdropTransparency;
    }

    // Cherche parmi les modules pas encore examinés ceux qui ressemblent à playbackManager,
    // appRouter et backdrop (définitions, pas simples usages), puis vérifie leurs exports.
    function scanModules(req) {
        var modules = req.m || {};
        var ids = Object.keys(modules);
        for (var i = 0; i < ids.length && !allFound(); i++) {
            var id = ids[i];
            if (scannedModules[id]) continue;
            scannedModules[id] = true;
            var src;
            try { src = Function.prototype.toString.call(modules[id]); } catch (e) { continue; }
            var maybePm = !pm && /setCurrentPlaylistItem\s*[=(]/.test(src) && /getCurrentPlaylistItemId\s*[=(]/.test(src)
                && src.indexOf('_currentPlayer') !== -1;
            // classe compilée par Babel : {key:"showVideoOsd",value:function(){return this.show("video")}}
            var maybeRouter = !router && src.indexOf('showVideoOsd') !== -1 && src.indexOf('showNowPlaying') !== -1
                && /\.show\(\s*["']video["']\s*\)/.test(src);
            var maybeBackdrop = !setBackdropTransparency && src.indexOf('backgroundContainer-transparent') !== -1;
            if (!maybePm && !maybeRouter && !maybeBackdrop) continue;
            var exp;
            try { exp = req(id); } catch (e) { continue; }
            if (!exp) continue;
            var keys = Object.keys(exp);
            for (var k = 0; k < keys.length; k++) {
                var v = exp[keys[k]];
                if (!v) continue;
                if (maybePm && typeof v.getPlaylist === 'function' && typeof v.setCurrentPlaylistItem === 'function'
                    && typeof v.stop === 'function' && typeof v.isPlayingVideo === 'function') {
                    pm = v;
                }
                if (maybeRouter && typeof v.showVideoOsd === 'function' && typeof v.back === 'function') {
                    router = v;
                }
                if (maybeBackdrop && typeof v === 'function') {
                    var fsrc = '';
                    try { fsrc = Function.prototype.toString.call(v); } catch (e) { /* ignore */ }
                    if (fsrc.indexOf('transparentDocument') !== -1 && fsrc.indexOf('backgroundContainer-transparent') !== -1) {
                        setBackdropTransparency = v;
                    }
                }
            }
        }
    }

    // Le script peut être chargé avant le bundle principal (plugin d'injection) :
    // on ré-essaie tant que playbackManager n'est pas apparu. appRouter et backdrop sont
    // facultatifs (sans eux, la suite automatique d'épisodes réaffiche le lecteur, et le
    // fond des pages est rétabli à la main).
    function waitForModules(req) {
        return new Promise(function (resolve, reject) {
            var started = Date.now();
            var tick = function () {
                scanModules(req);
                if (allFound()) return resolve();
                if (pm && Date.now() - started > 5000) return resolve();
                if (Date.now() - started > 60000) return reject(new Error('timeout'));
                setTimeout(tick, 250);
            };
            tick();
        });
    }

    /* ------------------------------------------------------------------ */
    /*  2. Helpers                                                         */
    /* ------------------------------------------------------------------ */

    function escapeHtml(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    // 1 tick = 100 ns. Même format que datetime.getDisplayRunningTime : h:mm:ss ou m:ss.
    function formatTicks(ticks) {
        var total = Math.floor((ticks || 0) / 10000000);
        var h = Math.floor(total / 3600);
        var m = Math.floor((total % 3600) / 60);
        var s = total % 60;
        var pad = function (n) { return (n < 10 ? '0' : '') + n; };
        return h ? h + ':' + pad(m) + ':' + pad(s) : m + ':' + pad(s);
    }

    function currentPlayer() {
        try { return pm.getCurrentPlayer(); } catch (e) { return null; }
    }

    // Seul le lecteur vidéo HTML local est concerné (pas Chromecast, pas une session distante,
    // pas un lecteur natif d'application).
    function isLocalHtmlVideo(player) {
        if (!player || !player.isLocalPlayer) return false;
        if (player.id && player.id !== 'htmlvideoplayer') return false;
        try { return !!pm.isPlayingVideo(player); } catch (e) { return false; }
    }

    function isTvLayout() {
        return document.documentElement.classList.contains('layout-tv');
    }

    function isOsdView(el) {
        return !!el && el.nodeType === 1 && (el.id === 'videoOsdPage' || el.getAttribute('data-type') === 'video-osd');
    }

    // Les pages déjà visitées restent dans le DOM, masquées (cache de vues) : il peut y avoir
    // plusieurs pages du lecteur, seule celle sans .hide est affichée.
    function getOsdPage() {
        var pages = document.querySelectorAll('#videoOsdPage, [data-type="video-osd"]');
        for (var i = 0; i < pages.length; i++) {
            if (!pages[i].classList.contains('hide')) return pages[i];
        }
        return null;
    }

    function upgrade(root) {
        try {
            if (window.CustomElements && typeof window.CustomElements.upgradeSubtree === 'function') {
                window.CustomElements.upgradeSubtree(root);
            }
        } catch (e) { /* ignore */ }
    }

    // Même règle que la barre native : affiche de la série pour un épisode, sinon Primary de
    // l'élément (repli : l'image de l'épisode lui-même s'il n'y a pas d'affiche de série).
    function getImageUrl(item) {
        var api = window.ApiClient;
        if (!item || !api || typeof api.getScaledImageUrl !== 'function') return null;
        var opts = function (tag) { return { type: 'Primary', height: 140, tag: tag }; };
        var tags = item.ImageTags || {};
        if (item.Type === 'Episode' && item.SeriesId && item.SeriesPrimaryImageTag) {
            return api.getScaledImageUrl(item.SeriesId, opts(item.SeriesPrimaryImageTag));
        }
        if (tags.Primary) return api.getScaledImageUrl(item.PrimaryImageItemId || item.Id, opts(tags.Primary));
        if (item.AlbumId && item.AlbumPrimaryImageTag) return api.getScaledImageUrl(item.AlbumId, opts(item.AlbumPrimaryImageTag));
        return null;
    }

    // Mêmes lignes que la barre native (getItemTextLines) : série / « S.E - titre », sinon titre / année.
    function getTextLines(item) {
        if (!item) return [];
        var line1 = item.Name;
        if (item.MediaType === 'Video') {
            if (item.IndexNumber != null) line1 = item.IndexNumber + ' - ' + line1;
            if (item.ParentIndexNumber != null) line1 = item.ParentIndexNumber + '.' + line1;
        }
        var line2 = null;
        if (item.SeriesName || item.Album) {
            line2 = line1;
            line1 = item.SeriesName || item.Album;
        } else if (item.ProductionYear) {
            line2 = String(item.ProductionYear);
        }
        return line1 ? (line2 ? [line1, line2] : [line1]) : [];
    }

    /* ------------------------------------------------------------------ */
    /*  3. Styles                                                          */
    /* ------------------------------------------------------------------ */

    // La barre reprend les classes de la barre native (nowPlayingBarTop, nowPlayingBarCenter…)
    // pour en avoir l'apparence exacte, thème compris. Seule la racine change de nom : la barre
    // native retrouve la sienne par la classe .nowPlayingBar, il ne faut pas qu'elle prenne la nôtre.
    function injectStyles() {
        if (document.getElementById('jfBackgroundPlayStyles')) return;
        var css = [
            // racine : copie des règles .nowPlayingBar / .nowPlayingBar-hidden
            '.jfBgBar { text-align: center; will-change: transform; contain: layout style; transition: transform 200ms ease-out; cursor: pointer; }',
            '.jfBgBar-hidden { transform: translate3d(0, 100%, 0); }',
            '.jfBgBar .nowPlayingImage { background-position: center center; background-repeat: no-repeat; background-size: contain; height: 70%; width: 4.2em; flex-shrink: 0; }',
            '.jfBgBar .nowPlayingBarText a { color: inherit; text-decoration: none; }',
            '@media all and (max-width: 24em) { .jfBgBar .jfBgMute { display: none; } }',
            // Stop à côté de pause, partout. Sur écran étroit (centre masqué) et sur mobile, les
            // commandes passent à droite ; la barre native, elle, n'y garde que lecture / suivant.
            '.jfBgBar .jfBgNarrow { display: none; }',
            '.layout-mobile .jfBgBar .nowPlayingBarCenter { display: none !important; }',
            '@media all and (max-width: 56em) { .jfBgBar .nowPlayingBarRight .jfBgNarrow { display: inline-flex; } }',
            // plus spécifique que la règle native compilée « .layout-mobile .nowPlayingBarRight button:not(.a):not(.b) »
            'html.layout-mobile .jfBgBar .nowPlayingBarRight button.jfBgNarrow, html.layout-mobile .jfBgBar .nowPlayingBarRight button.jfBgOpen { display: inline-flex; }',
            '.jfBgBar .jfBgBarExtra { display: flex; align-items: center; }',
            '.jfBgBar .jfBgBarExtra:empty { display: none; }',
            'html.layout-mobile .jfBgBar .nowPlayingBarRight div.jfBgBarExtra:not(:empty) { display: flex; }',
            'html.layout-mobile .jfBgBar .nowPlayingBarRight .jfBgBarExtra button { display: inline-flex; }',
            // la vidéo continue derrière l'interface : on ne la montre pas (ni ses sous-titres)
            'html.jfBgPlayMini .videoPlayerContainer { visibility: hidden !important; }',
            // bouton « Passer le générique » : il appartient au lecteur, pas aux pages
            'html.jfBgPlayMini .skip-button-container { display: none !important; }',
            // lecteur : la croix en haut à droite suit l'affichage de l'OSD
            '.jfBgOsdClose { position: fixed; top: 0; right: 0; z-index: 1300; margin: .35em .5em !important; padding: .4em !important;'
                + ' color: #fff; transition: opacity 300ms ease-out; }',
            '.jfBgOsdClose.jfBgOsdClose-hidden { opacity: 0; pointer-events: none; }',
            '.jfBgOsdClose .material-icons { font-size: 1.9em; }',
            // le titre et les boutons de l'en-tête du lecteur ne passent pas sous la croix
            'html.jfBgOsdOpen .osdHeader .headerRight, html.jfBgOsdOpen .videoOsd-appBar { padding-right: 3.6em; }'
        ].join('\n');
        var style = document.createElement('style');
        style.id = 'jfBackgroundPlayStyles';
        style.textContent = css;
        (document.head || document.documentElement).appendChild(style);
    }

    /* ------------------------------------------------------------------ */
    /*  4. Mini barre                                                      */
    /* ------------------------------------------------------------------ */

    function button(cls, icon, title) {
        return '<button is="paper-icon-button-light" type="button" class="' + cls + ' mediaButton paper-icon-button-light" title="'
            + escapeHtml(title) + '" aria-label="' + escapeHtml(title) + '"><span class="material-icons ' + icon + '" aria-hidden="true"></span></button>';
    }

    function getBarHtml() {
        return '<div class="jfBgBar hide jfBgBar-hidden">'
            + '<div class="nowPlayingBarTop">'
            + '<div class="nowPlayingBarPositionContainer sliderContainer" dir="ltr">'
            + '<input type="range" is="emby-slider" pin step=".01" min="0" max="100" value="0" class="slider-medium-thumb nowPlayingBarPositionSlider jfBgPosition" data-slider-keep-progress="true"/>'
            + '</div>'
            + '<div class="nowPlayingBarInfoContainer">'
            + '<div class="nowPlayingImage"></div>'
            + '<div class="nowPlayingBarText"></div>'
            + '</div>'
            + '<div class="nowPlayingBarCenter" dir="ltr">'
            + button('jfBgPrev', 'skip_previous', t('previous'))
            + button('jfBgPlayPause', 'pause', t('pause'))
            + button('jfBgStop', 'stop', t('stop'))
            + button('jfBgNext', 'skip_next', t('next'))
            + '<div class="nowPlayingBarCurrentTime"></div>'
            + '</div>'
            + '<div class="nowPlayingBarRight">'
            + button('jfBgMute', 'volume_up', t('mute'))
            + '<div class="sliderContainer nowPlayingBarVolumeSliderContainer" style="width:9em;vertical-align:middle;display:inline-flex;">'
            + '<input type="range" is="emby-slider" pin step="1" min="0" max="100" value="0" class="slider-medium-thumb nowPlayingBarVolumeSlider jfBgVolume"/>'
            + '</div>'
            + button('jfBgPlayPause jfBgNarrow', 'pause', t('pause'))
            + button('jfBgStop jfBgNarrow', 'stop', t('stop'))
            + button('jfBgNext jfBgNarrow', 'skip_next', t('next'))
            // emplacement pour les boutons d'autres plugins (ex. Player Queue), voir l'en-tête
            + '<div class="jfBgBarExtra"></div>'
            + button('jfBgOpen', 'open_in_full', t('openPlayer'))
            + '</div>'
            + '</div>'
            + '</div>';
    }

    function getBar() {
        if (bar) return bar;
        var footer = document.querySelector('.appfooter');
        if (!footer) return null;
        footer.insertAdjacentHTML('afterbegin', getBarHtml());
        var el = footer.querySelector('.jfBgBar');
        upgrade(el);
        bar = {
            el: el,
            image: el.querySelector('.nowPlayingImage'),
            text: el.querySelector('.nowPlayingBarText'),
            time: el.querySelector('.nowPlayingBarCurrentTime'),
            position: el.querySelector('.jfBgPosition'),
            volume: el.querySelector('.jfBgVolume'),
            mute: el.querySelector('.jfBgMute'),
            imageUrl: null,
            runtimeTicks: 0
        };
        bindBar(bar);
        return bar;
    }

    function bindBar(b) {
        var on = function (cls, fn) {
            Array.prototype.forEach.call(b.el.querySelectorAll('.' + cls), function (btn) {
                btn.addEventListener('click', function (e) {
                    e.stopPropagation();
                    var player = currentPlayer();
                    if (player) fn(player);
                    setTimeout(refreshBar, 50);
                });
            });
        };
        on('jfBgPlayPause', function (p) { pm.playPause(p); });
        on('jfBgStop', function (p) { stopPlayback(p); });
        on('jfBgPrev', function (p) { pm.previousTrack(p); });
        on('jfBgNext', function (p) { pm.nextTrack(p); });
        on('jfBgMute', function (p) {
            if (typeof p.toggleMute === 'function') p.toggleMute();
            else if (typeof p.setMute === 'function') p.setMute(!p.isMuted());
        });
        on('jfBgOpen', function () { openPlayer(); });

        b.position.addEventListener('change', function () {
            var player = currentPlayer();
            if (player) pm.seekPercent(parseFloat(this.value), player);
        });
        b.position.getBubbleText = function (value) {
            return b.runtimeTicks ? formatTicks(b.runtimeTicks * value / 100) : '--:--';
        };
        if (typeof b.position.enableKeyboardDragging === 'function') b.position.enableKeyboardDragging();

        b.volume.addEventListener('input', function () {
            var player = currentPlayer();
            if (player && typeof player.setVolume === 'function') player.setVolume(this.value);
        });

        // Comme la barre native : un clic ailleurs que sur un bouton ou un curseur ouvre le lecteur.
        b.el.addEventListener('click', function (e) {
            if (e.target.closest && e.target.closest('button, input')) return;
            openPlayer();
        });
    }

    function showBar() {
        var b = getBar();
        if (!b) return;
        b.el.classList.remove('hide');
        document.documentElement.classList.add('jfBgBarShown');
        void b.el.offsetWidth; // reflow : l'animation de montée part bien de l'état masqué
        b.el.classList.remove('jfBgBar-hidden');
    }

    function hideBar() {
        if (!bar || bar.el.classList.contains('hide')) return;
        var el = bar.el;
        document.documentElement.classList.remove('jfBgBarShown');
        el.classList.add('jfBgBar-hidden');
        setTimeout(function () {
            if (el.classList.contains('jfBgBar-hidden')) el.classList.add('hide');
        }, 250);
    }

    function setPlayPauseIcons(paused) {
        Array.prototype.forEach.call(bar.el.querySelectorAll('.jfBgPlayPause'), function (btn) {
            var icon = btn.querySelector('.material-icons');
            icon.classList.remove('play_arrow', 'pause');
            icon.classList.add(paused ? 'play_arrow' : 'pause');
            btn.title = t(paused ? 'play' : 'pause');
            btn.setAttribute('aria-label', btn.title);
        });
    }

    function updateItemInfo(item) {
        var lines = getTextLines(item);
        bar.text.innerHTML = lines.map(function (line, i) {
            return '<div' + (i ? ' class="nowPlayingBarSecondaryText"' : '') + '><a>' + escapeHtml(line) + '</a></div>';
        }).join('');

        var url = getImageUrl(item);
        if (url !== bar.imageUrl) {
            bar.imageUrl = url;
            bar.image.style.backgroundImage = url ? 'url("' + url + '")' : '';
            bar.image.style.display = url ? '' : 'none';
            bar.text.style.marginLeft = url ? '' : '1em';
        }

        // Précédent / suivant seulement s'il y a quelque chose avant / après dans la file.
        Promise.resolve(pm.getPlaylist()).then(function (list) {
            var index = pm.getCurrentPlaylistIndex();
            var count = (list || []).length;
            Array.prototype.forEach.call(bar.el.querySelectorAll('.jfBgPrev'), function (btn) {
                btn.classList.toggle('hide', !(index > 0));
            });
            Array.prototype.forEach.call(bar.el.querySelectorAll('.jfBgNext'), function (btn) {
                btn.classList.toggle('hide', !(index >= 0 && index < count - 1));
            });
        }).catch(function () { /* ignore */ });
    }

    function refreshBar() {
        if (!mini || !bar) return;
        var player = currentPlayer();
        if (!player) return;
        var state;
        try { state = pm.getPlayerState(player) || {}; } catch (e) { return; }
        var item = state.NowPlayingItem;
        var play = state.PlayState || {};
        if (!item) return;

        if (item.Id !== lastItemId) {
            lastItemId = item.Id;
            updateItemInfo(item);
        }

        setPlayPauseIcons(!!play.IsPaused);

        var runtime = item.RunTimeTicks || (state.MediaSource && state.MediaSource.RunTimeTicks) || 0;
        bar.runtimeTicks = runtime;
        var pos = play.PositionTicks || 0;
        if (!bar.position.dragging) {
            bar.position.disabled = !play.CanSeek;
            bar.position.value = runtime ? (pos / runtime) * 100 : 0;
            if (typeof bar.position.setBufferedRanges === 'function') {
                try { bar.position.setBufferedRanges(pm.getBufferedRanges(player), runtime, pos); } catch (e) { /* ignore */ }
            }
        }
        bar.time.textContent = formatTicks(pos) + (runtime ? ' / ' + formatTicks(runtime) : '');

        var muted = !!play.IsMuted;
        var muteIcon = bar.mute.querySelector('.material-icons');
        muteIcon.classList.remove('volume_off', 'volume_up');
        muteIcon.classList.add(muted ? 'volume_off' : 'volume_up');
        bar.mute.title = t(muted ? 'unmute' : 'mute');
        if (!bar.volume.dragging && play.VolumeLevel != null) bar.volume.value = play.VolumeLevel;
    }

    /* ------------------------------------------------------------------ */
    /*  5. Mode fond                                                       */
    /* ------------------------------------------------------------------ */

    // Le lecteur rend le document transparent (la vidéo est derrière) et bloque le défilement
    // de la page ; il ne le défait qu'à l'arrêt. En fond, on rend aux pages leur fond et leur
    // défilement. Le lecteur les réimpose à chaque épisode suivant : vérifié aussi par tick().
    function restorePage() {
        document.body.classList.remove('hide-scroll');
        if (!document.documentElement.classList.contains('transparentDocument')) return;
        if (setBackdropTransparency) {
            try { setBackdropTransparency('none'); return; } catch (e) { /* repli ci-dessous */ }
        }
        document.documentElement.classList.remove('transparentDocument');
        var bg = document.querySelector('.backgroundContainer');
        if (bg) bg.classList.remove('backgroundContainer-transparent');
        var backdrop = document.querySelector('.backdropContainer');
        if (backdrop) backdrop.classList.remove('hide');
    }

    function enterMini() {
        if (mini) return;
        mini = true;
        lastItemId = null;
        document.documentElement.classList.add('jfBgPlayMini');
        restorePage();
        // Le lecteur demandait peut-être le plein écran du navigateur : on en sort pour naviguer.
        try {
            if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(function () { /* ignore */ });
        } catch (e) { /* ignore */ }
        console.debug(TAG, 'video continues in the background');
        updateVisibility();
        if (!pollTimer) pollTimer = setInterval(tick, 500);
    }

    function exitMini() {
        if (!mini) return;
        mini = false;
        document.documentElement.classList.remove('jfBgPlayMini');
        hideBar();
        if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    }

    function updateVisibility() {
        if (mini && mediaControlAllowed && !getOsdPage()) {
            showBar();
            refreshBar();
        } else {
            hideBar();
        }
    }

    function tick() {
        if (!mini) return;
        // Vidéo arrêtée sans qu'on l'ait vu passer (filet de sécurité : playbackstop gère le cas normal).
        if (!isLocalHtmlVideo(currentPlayer())) {
            if (Date.now() > switchingUntil) exitMini();
            return;
        }
        if (!getOsdPage()) restorePage();
        refreshBar();
    }

    function stopPlayback(player) {
        exitMini();
        return origStop.call(pm, player || currentPlayer());
    }

    function openPlayer() {
        if (router && origShowVideoOsd) {
            origShowVideoOsd.call(router);
        } else {
            window.location.hash = '#/video';
        }
    }

    // Abonnement aux événements internes : même stockage que utils/events de jellyfin-web
    // (obj._callbacks[type], rappel appelé avec ({ type }, ...args)).
    function onEvent(obj, type, fn) {
        obj._callbacks = obj._callbacks || {};
        (obj._callbacks[type] = obj._callbacks[type] || []).push(fn);
    }

    function installHooks() {
        onEvent(pm, 'playbackstop', function (e, info) {
            if (!mini) return;
            info = info || {};
            var next = info.nextMediaType || (info.state && info.state.NextMediaType)
                || (info.nextItem && info.nextItem.MediaType);
            if (next === 'Video' || keepThroughStop) {
                keepThroughStop = false;
                switchingUntil = Date.now() + 60000;
            } else {
                // fin de la file, arrêt, ou musique lancée : la barre native prend le relais
                switchingUntil = 0;
                exitMini();
            }
        });
        onEvent(pm, 'playbackstart', function () {
            switchingUntil = 0;
            keepThroughStop = false;
            if (!mini) return;
            if (isLocalHtmlVideo(currentPlayer())) {
                restorePage();
                lastItemId = null;
                refreshBar();
            } else {
                exitMini();
            }
        });
        onEvent(pm, 'playbackcancelled', function () {
            switchingUntil = 0;
            keepThroughStop = false;
        });

        origStop = pm.stop;
        pm.stop = function () {
            if (hidingOsd && isLocalHtmlVideo(currentPlayer())) {
                hidingOsd = false;
                enterMini();
                return Promise.resolve();
            }
            return origStop.apply(this, arguments);
        };

        // Une nouvelle lecture demandée explicitement (Lire, Reprendre…) remet le lecteur au premier plan,
        // sauf si elle vient de la barre elle-même (option jfBackgroundPlay: 'keep', ex. Player Queue).
        var origPlay = pm.play;
        if (typeof origPlay === 'function') {
            pm.play = function (options) {
                if (mini && options && options.jfBackgroundPlay === 'keep') {
                    keepThroughStop = true;
                    switchingUntil = Date.now() + 60000;
                } else {
                    exitMini();
                }
                return origPlay.apply(this, arguments);
            };
        }

        // En fond, l'épisode suivant démarre sans réafficher le lecteur.
        if (router) {
            origShowVideoOsd = router.showVideoOsd;
            router.showVideoOsd = function () {
                if (mini) return Promise.resolve();
                return origShowVideoOsd.apply(this, arguments);
            };
        }

        // La page du lecteur se ferme : le stop qu'elle déclenche dans ses propres écouteurs
        // (phase cible) est intercepté. Capture = avant eux, bouillonnement = après eux.
        document.addEventListener('viewbeforehide', function (e) {
            if (!isOsdView(e.target) || isTvLayout()) return;
            hidingOsd = isLocalHtmlVideo(currentPlayer());
        }, true);
        document.addEventListener('viewbeforehide', function (e) {
            if (isOsdView(e.target)) hidingOsd = false;
        }, false);

        document.addEventListener('viewbeforeshow', function (e) {
            var detail = e.detail || {};
            var options = detail.options || {};
            if (isOsdView(e.target)) {
                // retour au lecteur : il retrouve sa page sans défilement, comme au lancement
                if (mini) document.body.classList.add('hide-scroll');
                exitMini();
                return;
            }
            mediaControlAllowed = options.enableMediaControl !== false;
            updateVisibility();
        });
        document.addEventListener('viewshow', function (e) {
            if (isOsdView(e.target)) setupOsd(e.target);
            else updateVisibility();
        });
    }

    /* ------------------------------------------------------------------ */
    /*  6. Lecteur : Stop à côté de pause, croix en haut à droite          */
    /* ------------------------------------------------------------------ */

    function setupOsd(page) {
        var pause = page.querySelector('.btnPause');
        if (pause && !page.querySelector('.jfBgOsdStop')) {
            pause.insertAdjacentHTML('afterend',
                '<button is="paper-icon-button-light" type="button" class="jfBgOsdStop autoSize paper-icon-button-light" title="'
                + escapeHtml(t('stop')) + '" aria-label="' + escapeHtml(t('stop')) + '">'
                + '<span class="xlargePaperIconButton material-icons stop" aria-hidden="true"></span></button>');
            var stopBtn = page.querySelector('.jfBgOsdStop');
            upgrade(stopBtn);
            stopBtn.addEventListener('click', function (e) {
                e.stopPropagation();
                stopPlayback();
            });
        }

        var close = document.querySelector('.jfBgOsdClose');
        if (!close) {
            document.body.insertAdjacentHTML('beforeend',
                '<button is="paper-icon-button-light" type="button" class="jfBgOsdClose paper-icon-button-light hide" title="'
                + escapeHtml(t('close')) + '" aria-label="' + escapeHtml(t('close')) + '">'
                + '<span class="material-icons close" aria-hidden="true"></span></button>');
            close = document.querySelector('.jfBgOsdClose');
            upgrade(close);
            close.addEventListener('click', function (e) {
                e.stopPropagation();
                stopPlayback();
            });
        }

        // La croix suit l'OSD : visible avec les commandes du bas, masquée avec elles,
        // retirée quand la page du lecteur se cache.
        var bottom = page.querySelector('.videoOsdBottom');
        var sync = function () {
            var shown = !!getOsdPage();
            close.classList.toggle('hide', !shown);
            document.documentElement.classList.toggle('jfBgOsdOpen', shown);
            close.classList.toggle('jfBgOsdClose-hidden', !!bottom && bottom.classList.contains('videoOsdBottom-hidden'));
        };
        if (osdObserver) osdObserver.disconnect();
        osdObserver = new MutationObserver(sync);
        if (bottom) osdObserver.observe(bottom, { attributes: true, attributeFilter: ['class'] });
        osdObserver.observe(page, { attributes: true, attributeFilter: ['class'] });
        sync();

        if (!page.__jfBgHideBound) {
            page.__jfBgHideBound = true;
            page.addEventListener('viewbeforehide', function () {
                close.classList.add('hide');
                document.documentElement.classList.remove('jfBgOsdOpen');
                if (osdObserver) { osdObserver.disconnect(); osdObserver = null; }
            });
        }
    }

    /* ------------------------------------------------------------------ */
    /*  7. Init                                                            */
    /* ------------------------------------------------------------------ */

    function init() {
        injectStyles();
        getWebpackRequire().then(waitForModules).then(function () {
            window.__jfBackgroundPlay.playbackManager = pm;
            window.__jfBackgroundPlay.appRouter = router;
            installHooks();
            console.debug(TAG, 'v' + VERSION + ' – playbackManager found' + (router ? ', appRouter found' : ', appRouter not found'));
            // Le script peut arriver alors que le lecteur est déjà affiché.
            var start = function () {
                var page = getOsdPage();
                if (page) setupOsd(page);
            };
            if (document.body) start();
            else document.addEventListener('DOMContentLoaded', start);
        }).catch(function () {
            console.warn(TAG, 'playbackManager not found – unsupported jellyfin-web version?');
        });
    }

    init();
})();
