#!/usr/bin/env python3
"""
Linux Time Tracker (X11)

- TOTAL ativo sempre no topo
- Agrupa por aplicativo (WM_CLASS)
- Firefox: agrupa pelo NOME DA ABA
- Pausa quando idle >= 10 min
- Salva CSV a cada 15 minutos
- Reabre CSV do dia se reiniciar

Deps:
  pip install python-xlib
System:
  sudo apt-get install -y libxss1
"""

import os
import time
import csv
import re
import ctypes
import ctypes.util
from datetime import datetime, date

from Xlib import X, display


# ================= CONFIG =================
IDLE_LIMIT_SECONDS = 10 * 60
POLL_SECONDS = 2
PRINT_EVERY_SECONDS = 10
TOP_N = 10
OUTPUT_DIR = "."
AUTOSAVE_SECONDS = 15 * 60
# ==========================================


# ---------- Helpers de arquivo ----------
def today_filename():
    return os.path.join(
        OUTPUT_DIR,
        f"timelog_{date.today().strftime('%Y_%m_%d')}.csv",
    )


def load_existing_csv(path):
    totals = {}
    total_active = 0.0

    if not os.path.exists(path):
        return totals, total_active

    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            bucket = row["bucket"]
            seconds = float(row["seconds"])
            if bucket == "TOTAL_ACTIVE":
                total_active = seconds
            else:
                totals[bucket] = seconds

    return totals, total_active


def save_csv(path, totals, total_active):
    tmp = path + ".tmp"
    with open(tmp, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["bucket", "seconds", "minutes", "hms"])
        w.writerow([
            "TOTAL_ACTIVE",
            round(total_active, 1),
            round(total_active / 60, 2),
            fmt_hms(total_active),
        ])
        for k, v in sorted(totals.items(), key=lambda x: x[1], reverse=True):
            w.writerow([k, round(v, 1), round(v / 60, 2), fmt_hms(v)])

    os.replace(tmp, path)


# ---------- Firefox mapping ----------
FIREFOX_SITE_ALIASES = {
    "gitlab": "gitlab.com",
    "github": "github.com",
    "youtube": "youtube.com",
    "chatgpt": "chat.openai.com",
    "openai": "openai.com",
    "gmail": "mail.google.com",
    "drive": "drive.google.com",
    "docs": "docs.google.com",
    "calendar": "calendar.google.com",
    "google": "google.com",
    "notion": "notion.so",
    "teams": "Microsoft Teams",
    "whatsapp": "WhatsApp Business",
    "Site ats": "Recrutamento e Seleção",
}


# ---------- Idle (XScreenSaver) ----------
class XScreenSaverInfo(ctypes.Structure):
    _fields_ = [
        ("window", ctypes.c_ulong),
        ("state", ctypes.c_int),
        ("kind", ctypes.c_int),
        ("til_or_since", ctypes.c_ulong),
        ("idle", ctypes.c_ulong),
        ("event_mask", ctypes.c_ulong),
    ]


def _load_xss_and_open_display_once():
    libx11 = ctypes.util.find_library("X11")
    libxss = ctypes.util.find_library("Xss")
    if not libx11 or not libxss:
        raise RuntimeError("Instale: sudo apt-get install -y libxss1")

    x11 = ctypes.CDLL(libx11)
    xss = ctypes.CDLL(libxss)

    x11.XOpenDisplay.restype = ctypes.c_void_p
    x11.XDefaultRootWindow.restype = ctypes.c_ulong
    x11.XCloseDisplay.argtypes = [ctypes.c_void_p]

    xss.XScreenSaverAllocInfo.restype = ctypes.POINTER(XScreenSaverInfo)
    xss.XScreenSaverQueryInfo.argtypes = [
        ctypes.c_void_p,
        ctypes.c_ulong,
        ctypes.POINTER(XScreenSaverInfo),
    ]

    dpy = x11.XOpenDisplay(None)
    if not dpy:
        raise RuntimeError("DISPLAY X11 não encontrado")

    root = x11.XDefaultRootWindow(dpy)
    info = xss.XScreenSaverAllocInfo()
    return x11, xss, dpy, root, info


def get_idle_seconds_xss(xss, dpy, root, info):
    xss.XScreenSaverQueryInfo(dpy, root, info)
    return info.contents.idle / 1000.0


# ---------- X11 active window ----------
def get_active_window(disp):
    root = disp.screen().root
    atom = disp.intern_atom("_NET_ACTIVE_WINDOW")
    prop = root.get_full_property(atom, X.AnyPropertyType)
    if not prop or not prop.value:
        return None
    return disp.create_resource_object("window", int(prop.value[0]))


def get_window_title(disp, win):
    for atom_name in ("_NET_WM_NAME", "WM_NAME"):
        try:
            atom = disp.intern_atom(atom_name)
            prop = win.get_full_property(atom, X.AnyPropertyType)
            if prop and prop.value:
                return bytes(prop.value).decode("utf-8", errors="ignore").strip()
        except Exception:
            pass
    return ""


def get_window_class(disp, win):
    try:
        atom = disp.intern_atom("WM_CLASS")
        prop = win.get_full_property(atom, X.AnyPropertyType)
        if not prop or not prop.value:
            return "<no-app>"
        parts = bytes(prop.value).split(b"\x00")
        return parts[1].decode(errors="ignore") if len(parts) > 1 else parts[0].decode(errors="ignore")
    except Exception:
        return "<no-app>"


# ---------- Firefox parsing ----------
SEPS_RE = re.compile(r"\s*[·|–—\-]\s*")


def firefox_bucket_from_title(title):
    clean = title.replace(" - Mozilla Firefox", "").replace(" — Mozilla Firefox", "").strip()
    low = clean.lower()

    for key, domain in FIREFOX_SITE_ALIASES.items():
        if key in low:
            return f"Firefox: {domain}"

    return f"Firefox: {clean}" if clean else "Firefox"


def bucket_key(app, title):
    if "firefox" in (app or "").lower():
        return firefox_bucket_from_title(title)
    return app or "<no-app>"


# ---------- Utils ----------
def fmt_hms(seconds):
    s = int(seconds)
    return f"{s//3600:02d}:{(s%3600)//60:02d}:{s%60:02d}"


# ================= MAIN =================
def main():
    disp = display.Display()
    x11, xss, dpy_c, root_c, info_c = _load_xss_and_open_display_once()

    csv_path = today_filename()
    totals, total_active = load_existing_csv(csv_path)

    last_ts = time.time()
    last_print = 0
    last_save = time.time()

    print("✅ Rodando — autosave a cada 15 min")
    print("📄 Arquivo:", csv_path, "\n")

    try:
        while True:
            now = time.time()
            dt = now - last_ts
            last_ts = now

            idle = get_idle_seconds_xss(xss, dpy_c, root_c, info_c)

            if idle < IDLE_LIMIT_SECONDS:
                win = get_active_window(disp)
                if win:
                    app = get_window_class(disp, win)
                    title = get_window_title(disp, win)
                else:
                    app, title = "<no-app>", ""

                key = bucket_key(app, title)
                totals[key] = totals.get(key, 0.0) + dt
                total_active += dt

            if now - last_save >= AUTOSAVE_SECONDS:
                save_csv(csv_path, totals, total_active)
                last_save = now

            if PRINT_EVERY_SECONDS and now - last_print >= PRINT_EVERY_SECONDS:
                last_print = now
                print(f"TOTAL: {fmt_hms(total_active)} | idle: {int(idle)}s")
                for k, v in sorted(totals.items(), key=lambda x: x[1], reverse=True)[:TOP_N]:
                    print(f"{fmt_hms(v)}  {k}")
                print()

            time.sleep(POLL_SECONDS)

    except KeyboardInterrupt:
        print("\n⛔ Encerrando... salvando")

    finally:
        save_csv(csv_path, totals, total_active)
        try:
            x11.XCloseDisplay(dpy_c)
        except Exception:
            pass

        print("✅ Salvo:", csv_path)
        print("TOTAL:", fmt_hms(total_active))


if __name__ == "__main__":
    main()
