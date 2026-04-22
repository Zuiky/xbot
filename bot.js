import os
import asyncio
import re
from pyrogram import Client, filters
from pyrogram.types import InlineKeyboardMarkup, InlineKeyboardButton, CallbackQuery
from pyrogram.errors import ChatAdminRequired, ChatNotFound, Forbidden
import yt_dlp
import logging
from dotenv import load_dotenv

# Load .env
load_dotenv()
logging.basicConfig(level=logging.INFO)

# ==================== CONFIG ====================
API_ID = int(os.getenv("API_ID"))
API_HASH = os.getenv("API_HASH")
BOT_TOKEN = os.getenv("BOT_TOKEN")
OWNER_ID = int(os.getenv("OWNER_ID"))

# PRIVATE GROUPS (-100xxxxxxxxxx format)
CHANNELS = {
    "asia": os.getenv("CHANNEL_ASIA"),
    "lokalx": os.getenv("CHANNEL_LOKALX"),
    "vgkx": os.getenv("CHANNEL_VGKX"),
    "normalindo": os.getenv("CHANNEL_NORMALINDO")
}

# Create downloads folder
os.makedirs("downloads", exist_ok=True)

# Init client
app = Client("twitter_pro_bot", api_id=API_ID, api_hash=API_HASH, bot_token=BOT_TOKEN)

# Global storage for owner pending links
pending_links = {}

# ==================== FUNCTIONS ====================
async def download_video(url: str):
    """Download Twitter video using yt-dlp"""
    ydl_opts = {
        'outtmpl': 'downloads/%(title)s.%(ext)s',
        'format': 'best[ext=mp4]',
        'noplaylist': True,
    }
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            filename = ydl.prepare_filename(info)
            
            # Check exact filename
            if os.path.exists(filename):
                return filename
            
            # Check common extensions
            base_name = filename.rsplit('.', 1)[0]
            for ext in ['.mp4', '.mkv', '.webm']:
                test_file = base_name + ext
                if os.path.exists(test_file):
                    return test_file
    except Exception as e:
        logging.error(f"Download error: {e}")
    return None

def is_owner(user_id: int) -> bool:
    """Check if user is owner"""
    return user_id == OWNER_ID

def channel_keyboard():
    """Inline keyboard for channel selection"""
    buttons = [
        [InlineKeyboardButton("🇦 ASIA", callback_data="upload_asia")],
        [InlineKeyboardButton("🇮🇩 LOKALX", callback_data="upload_lokalx")],
        [InlineKeyboardButton("🔥 VGKX", callback_data="upload_vgkx")],
        [InlineKeyboardButton("🇮🇩 NORMALINDO", callback_data="upload_normalindo")],
        [InlineKeyboardButton("❌ Cancel", callback_data="cancel")]
    ]
    return InlineKeyboardMarkup(buttons)

# ==================== HANDLERS ====================
@app.on_message(filters.private & filters.text & filters.regex(r"https?://(?:www\.)?(?:twitter\.com|x\.com)/"))
async def handle_twitter_link(client: Client, message):
    """Handle Twitter links - Owner gets buttons, Public gets download"""
    url = message.text.strip()
    user_id = message.from_user.id
    
    if is_owner(user_id):
        # OWNER: Store link and show channel buttons
        pending_links[user_id] = url
        await message.reply(
            "✅ **Link Twitter detected!**\n\n"
            "👇 **Pilih channel untuk upload:**",
            reply_markup=channel_keyboard()
        )
    else:
        # PUBLIC: Direct download to PM
        await message.reply("⏳ **Mendownload video untukmu...**")
        video_path = await download_video(url)
        
        if video_path and os.path.exists(video_path):
            try:
                with open(video_path, 'rb') as video_file:
                    await message.reply_video(
                        video=video_file,
                        caption=f"✅ **Video berhasil didownload!**\n🔗 {url}"
                    )
                os.remove(video_path)
            except Exception as e:
                await message.reply(f"❌ **Upload Error:** {str(e)}")
                if os.path.exists(video_path):
                    os.remove(video_path)
        else:
            await message.reply("❌ **Gagal download! Pastikan link valid.**")

@app.on_callback_query(filters.regex(r"upload_(asia|lokalx|vgkx|normalindo)"))
async def upload_to_channel(client: Client, callback: CallbackQuery):
    """Handle channel upload button clicks"""
    user_id = callback.from_user.id
    
    if not is_owner(user_id):
        await callback.answer("❌ **Hanya Owner!**", show_alert=True)
        return
    
    channel_key = callback.data.split("_")[1]
    channel_id = CHANNELS.get(channel_key)
    url = pending_links.get(user_id)
    
    if not url:
        await callback.answer("❌ **Tidak ada link!**", show_alert=True)
        return
    
    if not channel_id:
        await callback.answer("❌ **Channel tidak ditemukan!**", show_alert=True)
        return
    
    # Update message
    await callback.message.edit_text(f"⏳ **{channel_key.upper()}** - Downloading...")
    
    # Download
    video_path = await download_video(url)
    
    if video_path and os.path.exists(video_path):
        try:
            await callback.message.edit_text(f"✅ **{channel_key.upper()}** - Uploading...")
            
            # Upload ke private group
            with open(video_path, 'rb') as video_file:
                await client.send_video(
                    chat_id=channel_id,  # -100xxxxxxxxxx
                    video=video_file,
                    caption=f"📱 **Twitter Video**\n🔗 {url}\n\n#{channel_key.upper()}"
                )
            
            await callback.message.edit_text(f"🎉 **{channel_key.upper()}** ✅ **BERHASIL UPLOAD!**")
            
            # Cleanup
            del pending_links[user_id]
            os.remove(video_path)
            
        except ChatAdminRequired:
            await callback.message.edit_text(f"❌ **{channel_key.upper()}** - Bot bukan admin!")
        except ChatNotFound:
            await callback.message.edit_text(f"❌ **{channel_key.upper()}** - Group tidak ditemukan!")
        except Forbidden:
            await callback.message.edit_text(f"❌ **{channel_key.upper()}** - Bot no permission!")
        except Exception as e:
            await callback.message.edit_text(f"❌ **Upload Error:** {str(e)}")
            if os.path.exists(video_path):
                os.remove(video_path)
    else:
        await callback.message.edit_text("❌ **Gagal download video!**")

@app.on_callback_query(filters.regex("cancel"))
async def cancel_upload(client: Client, callback: CallbackQuery):
    """Cancel upload"""
    user_id = callback.from_user.id
    if user_id in pending_links:
        del pending_links[user_id]
    await callback.message.edit_text("❌ **Dibatalkan!**")
    await callback.answer()

@app.on_message(filters.command("start"))
async def start_command(client: Client, message):
    """Start command with group info"""
    text = """
🤖 **Twitter Video PRO Bot** 

**🔓 PUBLIC (Semua orang):**
- Kirim link Twitter → Download pribadi

**👑 OWNER ONLY:**
- Kirim link → **Pilih 4 channel via BUTTONS**
- ASIA • LOKALX • VGKX • NORMALINDO

**📢 Private Groups:**
"""
    for key, chat_id in CHANNELS.items():
        text += f"• **{key.upper()}**: `{chat_id}`\n"
    
    text += "\n**Bot harus ADMIN di semua groups!**"
    await message.reply(text)

@app.on_message(filters.command("test") & filters.private)
async def test_groups(client: Client, message):
    """Test all group connections (Owner only)"""
    if not is_owner(message.from_user.id):
        return
    
    text = "**🧪 Testing 4 Private Groups:**\n\n"
    for name, chat_id in CHANNELS.items():
        try:
            await client.send_message(chat_id, f"🧪 **{name.upper()} TEST** - {asyncio.get_event_loop().time()}")
            text += f"✅ **{name.upper()}**: `{chat_id}` OK\n"
        except Exception as e:
            text += f"❌ **{name.upper()}**: `{chat_id}` ERROR: {str(e)[:50]}...\n"
    
    await message.reply(text)

@app.on_message(filters.command("groups") & filters.private)
async def list_groups(client: Client, message):
    """List groups (Owner only)"""
    if not is_owner(message.from_user.id):
        return
    
    text = "**📢 4 Private Groups:**\n\n"
    for cmd, ch_id in CHANNELS.items():
        text += f"• `/{cmd}` → `{ch_id}`\n"
    await message.reply(text)

# ==================== START ====================
if __name__ == "__main__":
    print("🚀 Twitter PRO Bot (Private Groups)")
    print(f"👑 Owner ID: {OWNER_ID}")
    print("✅ Ready for -100xxxxxxxxxx private groups!")
    app.run()
