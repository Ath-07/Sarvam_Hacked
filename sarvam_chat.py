import os
from pathlib import Path

from sarvamai import SarvamAI

if not os.environ.get("SARVAM_API_KEY"):
    for line in Path(__file__).with_name(".env").read_text(encoding="utf-8").splitlines():
        name, separator, value = line.partition("=")
        if separator and name.strip() == "SARVAM_API_KEY":
            os.environ["SARVAM_API_KEY"] = value.strip().strip("\"'")
            break

if not os.environ.get("SARVAM_API_KEY"):
    raise SystemExit("Set SARVAM_API_KEY in .env or the environment.")

client = SarvamAI(api_subscription_key=os.environ["SARVAM_API_KEY"])
response = client.chat.completions(
    model="sarvam-105b-conversations",
    messages=[{"role": "user", "content": "Hello! Introduce yourself briefly."}],
)
print(response.choices[0].message.content)
