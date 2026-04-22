import os
import asyncio
import re
from pyrogram import Client, filters
from pyrogram.types import InlineKeyboardMarkup, InlineKeyboardButton, CallbackQuery
import yt_dlp
import logging
from dotenv import load_dotenv

load_dotenv()
logging.basicConfig(level=logging.INFO)

# Config
API_ID = int(os.getenv("API_ID"))
API_HASH = os.getenv("API_HASH")
BOT_TOKEN = os.getenv("BOT_TOKEN")
OWNER_ID = int(os.getenv("OWNER_ID"))

CHANNELS = {
    "asia": os.getenv("CHANNEL_ASIA"),
    "lokalx": os.getenv("CHANNEL_LOKALX"),
    "vgkx": os.getenv("CHANNEL_VGKX"),
    "normalindo": os.getenv("CHANNEL_NORMALINDO")
}

os.makedirs("downloads", exist_ok=True)
app = Client("twitter_pro_bot", api_id=API_ID, api_hash=API_HASH, bot_token=BOT_TOKEN)

# Global storage untuk pending links owner
pending_links = {}

async def download_video(url: str):
    ydl_opts = {'outtmpl': 'downloads/%(title)s.%(ext)s', 'format': 'best[ext=mp4]', 'noplaylist': True}
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            filename = ydl.prepare_filename(info)
            if os.path.exists(filename): return filename
            base = filename.rsplit('.', 1)[0]
            for ext in ['.mp4', '.mkv', '.webm']:
                test = base + ext
                if os.path.exists(test): return test
    except: pass
    return None

def is_owner(user_id: int) -> bool:
    return user_id == OWNER_ID

# Inline Keyboard untuk pilihan channel
def channel_keyboard():
    buttons = [
        [InlineKeyboardButton("🇦 ASIA", callback_data="upload_asia")],
        [InlineKeyboardButton("🇮🇩 LOKALX", callback_data="upload_lokalx")],
        [InlineKeyboardButton("🔥 VGKX", callback_data="upload_vgkx")],
        [InlineKeyboardButton("🇮🇩 NORMALINDO", callback_data="upload_normalindo")],
        [InlineKeyboardButton("❌ Cancel", callback_data="cancel")]
    ]
    return InlineKeyboardMarkup(buttons)

@app.on_message(filters.private & filters.text & filters.regex(r"https?://(?:www\.)?(?:twitter\.com|x\.com)/"))
async def handle_twitter_link(client: Client, message):
    url = message.text.strip()
    user_id = message.from_user.id
    
    # OWNER: Show channel buttons
    if is_owner(user_id):
        pending_links[user_id] = url
        await message.reply(
            "✅ **Link detected!**\nPilih channel untuk upload:",
            reply_markup=channel_keyboard()
        )
    # PUBLIC: Direct download
    else:
        await message.reply("⏳ Downloading your video...")
        video_path = await download_video(url)
        if video_path and os.path.exists(video_path):
            try:
                with open(video_path, 'rb') as f:
                    await message.reply_video(video=f, caption=f"✅ Downloaded!\n🔗 {url}")
                os.remove(video_path)
            except Exception as e:
                await message.reply(f"❌ Error: {e}")
                if os.path.exists(video_path): os.remove(video_path)
        else:
            await message.reply("❌ Failed to download!")

@app.on_callback_query(filters.regex(r"upload_(asia|lokalx|vgkx|normalindo)"))
async def upload_to_channel(client: Client, callback: CallbackQuery):
    user_id = callback.from_user.id
    if not is_owner(user_id):
        return await callback.answer("❌ Owner only!", show_alert=True)
    
    channel_key = callback.data.split("_")[1]
    channel_id = CHANNELS.get(channel_key)
    url = pending_links.get(user_id)
    
    if not url:
        return await callback.answer("❌ No link found!", show_alert=True)
    
    await callback.message.edit_text(f"⏳ **{channel_key.upper()}** - Downloading...")
    
    video_path = await download_video(url)
    if video_path and os.path.exists(video_path):
        try:
            await callback.message.edit_text("✅ **Uploading to channel...**")
            with open(video_path, 'rb') as f:
                await client.send_video(
                    chat_id=channel_id,
                    video=f,
                    caption=f"📱 Twitter Video\n🔗 {url}\n\n#{channel_key.upper()}"
                )
            await callback.message.edit_text(f"🎉 **{channel_key.upper()}** ✅ UPLOADED!")
            del pending_links[user_id]
        except Exception as e:
            await callback.message.edit_text(f"❌ **Upload Error:** {e}")
            if os.path.exists(video_path): os.remove(video_path)
    else:
        await callback.message.edit_text("❌ **Download Failed!**")

@app.on_callback_query(filters.regex("cancel"))
async def cancel_upload(client: Client, callback: CallbackQuery):
    user_id = callback.from_user.id
    if user_id in pending_links:
        del pending_links[user_id]
    await callback.message.edit_text("❌ **Cancelled!**")
    await callback.answer()

@app.on_message(filters.command("start"))
async def start(client: Client, message):
    text = """
🤖 **Twitter Video PRO Bot**

**🔓 PUBLIC:**
- Kirim link Twitter → Auto download pribadi

**👑 OWNER FEATURES:**
- Kirim link → Pilih 4 channel via **BUTTONS**
- **ASIA** • **LOKALX** • **VGKX** • **NORMALINDO**

**Groups:**
"""
    for k, v in CHANNELS.items():
        text += f"• **{k.upper()}**: {v}\n"
    
    await message.reply(text)

@app.on_message(filters.command("groups") & filters.private)
async def groups_list(client: Client, message):
    if not is_owner(message.from_user.id): return
    text = "**📢 Channel List:**\n\n"
    for cmd, ch in CHANNELS.items():
        text += f"• `{cmd.upper()}`: {ch}\n"
    await message.reply(text)

if __name__ == "__main__":
    print("🚀 Twitter PRO Bot Started!")
    print(f"👑 Owner ID: {OWNER_ID}")
    app.run()