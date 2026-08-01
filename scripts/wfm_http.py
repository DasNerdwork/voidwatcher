"""
Gemeinsamer HTTP-Ausgang für allen ausgehenden Verkehr der Sync-Skripte.

Vorher gab es neun unabhängige requests.get-Aufrufe mit je eigenen oder gar
keinen Headern. Das verstieß gegen zwei der veröffentlichten warframe.market-
Regeln:

  1. „Identify Your Application" — sync_api.py und check_version.py setzten
     keinerlei User-Agent, warframe.market sah also `python-requests/2.32.4`
     für rund 3.800 Anfragen pro Lauf. Genau die anonyme Signatur, die laut
     Regeln blockiert werden darf.

  2. „The general public API limit is 3 requests per second." — gedrosselt
     wurde mit time.sleep(0.5) INNERHALB des Worker-Threads. Bei sechs Workern
     ergibt das keine 2/s, sondern rund 4,8/s. Eine Drosselung, die sich durch
     die Worker-Zahl teilen lässt, ist keine.

Beides ist hier zentral gelöst: ein Session-Objekt mit User-Agent (nebenbei
Verbindungs-Pooling statt 3.800 einzelner TLS-Handshakes) und ein globaler
Token-Bucket, den sich alle Threads UND beide Skripte teilen — sync_images.py
läuft aus sync_api.py heraus im selben Prozess und kann das Budget dadurch
nicht mehr zusätzlich belasten.
"""

import logging
import threading
import time

import requests

# Projektname, Version, Website, Repository - die Beispiele, die die Regeln
# ausdrücklich nennen. Ohne Kontaktmöglichkeit ist eine Kennung wertlos.
USER_AGENT = (
    "VoidTicker/1.0 "
    "(+https://voidticker.com; "
    "+https://github.com/DasNerdwork/voidticker)"
)

# Veröffentlichte Obergrenze: „The general public API limit is 3 requests per
# second." Wir fahren exakt dort.
#
# Eine Randbedingung, die man kennen sollte, falls warframe.market je drosselt:
# bei genau 3,0/s liegen die Anfragen auf t = 0; 0,333; 0,667; 1,000 - ein
# serverseitiger Zähler mit gleitendem Sekundenfenster kann darin VIER Anfragen
# sehen. Diese Konstante auf 2,9 zu senken (Abstand 0,345s) räumt das aus und
# kostet auf einen Volllauf von gut 20 Minuten rund 30 Sekunden. Erster Hebel,
# wenn es Beschwerden gibt.
MARKET_RATE_PER_SEC = 3.0

SESSION = requests.Session()
SESSION.headers.update({"User-Agent": USER_AGENT})


class RateLimiter:
    """
    Globaler Token-Bucket über alle Threads.

    Der Kniff steckt in acquire(): der Zeitschlitz wird UNTER dem Lock
    reserviert, geschlafen wird DANACH ohne Lock. Schliefe man im Lock, wartete
    jeder Thread zusätzlich auf alle Vorgänger und die tatsächliche Rate fiele
    weit unter die Zielrate. So verteilen sich n Threads auf exakt
    `rate_per_sec` Anfragen pro Sekunde — unabhängig davon, wie viele es sind.
    """

    def __init__(self, rate_per_sec: float):
        self._interval = 1.0 / rate_per_sec
        self._lock = threading.Lock()
        self._next = 0.0

    def acquire(self) -> None:
        with self._lock:
            start = max(time.monotonic(), self._next)
            self._next = start + self._interval
        wait = start - time.monotonic()
        if wait > 0:
            time.sleep(wait)

    def penalise(self, seconds: float) -> None:
        """
        Nach einem 429 die Freigabe für ALLE Threads nach hinten schieben.

        Die frühere Lösung ließ den betroffenen Thread 2s schlafen, während die
        übrigen fünf unvermindert weiterliefen — eine Drosselung, die genau dann
        nicht griff, wenn der Server sie brauchte.
        """
        with self._lock:
            self._next = max(self._next, time.monotonic() + seconds)


MARKET_LIMITER = RateLimiter(MARKET_RATE_PER_SEC)


def retry_after_seconds(response, default: float = 5.0) -> float:
    """Retry-After auswerten, falls der Server ihn mitschickt."""
    raw = response.headers.get("Retry-After")
    if raw:
        try:
            return max(0.0, float(raw))
        except ValueError:
            pass  # HTTP-Datum statt Sekunden — nicht die Mühe wert, default reicht
    return default


def market_get(url: str, **kwargs):
    """
    GET auf warframe.market: gedrosselt, mit User-Agent.

    Bei 429 wird der gesamte Pool gebremst, nicht nur der aufrufende Thread.
    Die Antwort wird trotzdem zurückgegeben — was daraus folgt, entscheidet der
    Aufrufer, der den Endpunkt kennt.
    """
    MARKET_LIMITER.acquire()
    r = SESSION.get(url, **kwargs)
    if r.status_code == 429:
        wait = retry_after_seconds(r)
        logging.warning("429 von %s — Pool wird %.1fs gebremst", url, wait)
        MARKET_LIMITER.penalise(wait)
    return r


def plain_get(url: str, **kwargs):
    """
    GET auf alles andere (GitHub raw, wiki.warframe.com, worldState): nur
    User-Agent, kein Market-Budget. Diese Hosts haben eigene Grenzen und dürfen
    das warframe.market-Kontingent nicht aufbrauchen.
    """
    return SESSION.get(url, **kwargs)
