"""Запуск «Формы роста» без создания виртуального окружения.

Использует текущий Python и устанавливает недостающие зависимости в пользовательский
каталог Python (pip --user), а не в папку проекта. Требуется интернет при первом запуске,
если Flask/Werkzeug ещё не установлены.
"""
from __future__ import annotations

import importlib.metadata
import json
import re
import subprocess
import sys
import threading
import time
import webbrowser
from pathlib import Path
from urllib.error import URLError
from urllib.request import urlopen

BASE_DIR = Path(__file__).resolve().parent
REQUIREMENTS = BASE_DIR / "requirements.txt"
APP_FILE = BASE_DIR / "app.py"
URL = "http://127.0.0.1:5000"


def print_and_flush(message: str) -> None:
    print(message, flush=True)


def version_tuple(value: str) -> tuple[int, ...]:
    match = re.match(r"^(\d+(?:\.\d+)*)", value)
    if not match:
        return (0,)
    return tuple(int(part) for part in match.group(1).split("."))


def dependencies_ready() -> bool:
    """Check supported Flask/Werkzeug versions using current Python installation."""
    try:
        flask_version = version_tuple(importlib.metadata.version("Flask"))
        werkzeug_version = version_tuple(importlib.metadata.version("Werkzeug"))
    except importlib.metadata.PackageNotFoundError:
        return False
    return (3, 0) <= flask_version < (4, 0) and (3, 0) <= werkzeug_version < (4, 0)


def ensure_dependencies() -> bool:
    if dependencies_ready():
        print_and_flush("[1/3] Flask и Werkzeug уже установлены. Папка .venv не создаётся.")
        return True

    print_and_flush("[1/3] Устанавливаю необходимые библиотеки в пользовательский каталог Python…")
    print_and_flush("Это выполняется один раз; для установки нужен интернет.")
    command = [
        sys.executable, "-m", "pip", "install", "--user",
        "-r", str(REQUIREMENTS),
    ]
    try:
        subprocess.run(command, cwd=BASE_DIR, check=True)
    except subprocess.CalledProcessError:
        print_and_flush("Не удалось установить зависимости автоматически.")
        print_and_flush("Попробуй выполнить в терминале: python -m pip install --user -r requirements.txt")
        return False
    except OSError as error:
        print_and_flush(f"Не удалось запустить pip: {error}")
        print_and_flush("Установи Python с pip и повтори запуск.")
        return False

    if not dependencies_ready():
        print_and_flush("Зависимости установлены не полностью или текущий Python их не видит.")
        print_and_flush("Проверь, что pip и start.py используют один и тот же Python.")
        return False
    print_and_flush("[2/3] Зависимости готовы. Проектная папка .venv не используется.")
    return True


def wait_until_ready(process: subprocess.Popen[bytes]) -> None:
    """Open a browser only after the local Flask API responds successfully."""
    deadline = time.monotonic() + 90
    health_url = f"{URL}/api/health"
    while time.monotonic() < deadline:
        if process.poll() is not None:
            return
        try:
            with urlopen(health_url, timeout=1.5) as response:
                if response.status == 200:
                    payload = json.loads(response.read().decode("utf-8"))
                    if payload.get("status") == "ok":
                        print_and_flush(f"\n[3/3] Сайт запущен: {URL}")
                        print_and_flush("Не закрывай это окно, пока пользуешься сайтом.")
                        webbrowser.open(URL)
                        return
        except (URLError, TimeoutError, OSError, ValueError):
            pass
        time.sleep(0.5)
    print_and_flush(f"Сервер не ответил за отведённое время. Открой {URL} вручную, если он ещё запускается.")


def main() -> int:
    print("Форма роста — запуск без .venv")
    print("=" * 36)
    if not APP_FILE.is_file() or not REQUIREMENTS.is_file():
        print_and_flush("Не найдены app.py или requirements.txt. Распакуй архив целиком и запусти start.py из папки forma-rosta.")
        return 1

    if not ensure_dependencies():
        if sys.stdin and sys.stdin.isatty():
            input("Нажми Enter, чтобы закрыть окно…")
        return 1

    print_and_flush("Запускаю сервер с текущим интерпретатором Python…")
    try:
        process = subprocess.Popen([sys.executable, str(APP_FILE)], cwd=BASE_DIR)
    except OSError as error:
        print_and_flush(f"Не удалось запустить сервер: {error}")
        return 1

    threading.Thread(target=wait_until_ready, args=(process,), daemon=True).start()
    try:
        return process.wait()
    except KeyboardInterrupt:
        print_and_flush("\nОстанавливаю сервер…")
        process.terminate()
        try:
            return process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
            return process.wait()


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print_and_flush(f"Непредвиденная ошибка: {error}")
        if sys.stdin and sys.stdin.isatty():
            input("Нажми Enter, чтобы закрыть окно…")
        raise
