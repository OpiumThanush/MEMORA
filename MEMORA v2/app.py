from flask import Flask, request, jsonify, render_template, session
import groq
import os
import re
from bs4 import BeautifulSoup

API_KEY = "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"
client = groq.Client(api_key=API_KEY)

app = Flask(__name__, template_folder="templates", static_folder="static")
app.secret_key = 'your_secret_key'

@app.route('/')
def index():
    # Set a session variable for first-time visits
    is_first_visit = 'has_visited' not in session
    if is_first_visit:
        session['has_visited'] = True
    return render_template('dashboard.html', is_first_visit=is_first_visit)

@app.route('/write')
def write():
    return render_template('write.html')

@app.route('/journals')
def journals():
    return render_template('journals.html')

@app.route('/chat')
def chat_page():
    return render_template('chat.html')

@app.route('/settings')
def settings():
    return render_template('settings.html')

@app.route('/save_journal', methods=['POST'])
def save_journal():
    data = request.json
    journal_entry = data.get('entry', '')
    title = data.get('title', '').strip()
    date = data.get('date', '').strip()
    
    # Validate required fields
    if not all([journal_entry, title, date]):
        return jsonify({"error": "Missing required fields"}), 400
    
    # Clean the journal entry content - strip HTML tags and styles
    def clean_content(html_content):
        if not html_content:
            return ""
        # Parse HTML and get text content
        soup = BeautifulSoup(html_content, 'html.parser')
        # Get text while preserving paragraphs and line breaks
        text = ''
        for element in soup.find_all(['p', 'div', 'br']):
            if element.name == 'br':
                text += '\n'
            else:
                text += element.get_text() + '\n\n'
        return text.strip()
    
    cleaned_entry = clean_content(journal_entry)
    
    # Validate date format (YYYY-MM-DD)
    if not re.match(r'^\d{4}-\d{2}-\d{2}$', date):
        return jsonify({"error": "Invalid date format. Use YYYY-MM-DD"}), 400
    
    # Create sanitized filename
    safe_title = re.sub(r'[^\w\s-]', '', title).strip()
    safe_title = re.sub(r'[-\s]+', '_', safe_title)
    filename = f"{date}_{safe_title}.txt"
    
    if not filename or filename == '.txt':
        return jsonify({"error": "Invalid filename"}), 400
    
    try:
        with open(filename, "w", encoding='utf-8') as file:
            file.write(cleaned_entry)
        return jsonify({
            "message": "Journal saved successfully!", 
            "filename": filename
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/list_journals', methods=['GET'])
def list_journals():
    files = [f for f in os.listdir() if f.endswith(".txt")]
    return jsonify({"journals": files})

@app.route('/load_journal', methods=['POST'])
def load_journal():
    data = request.json
    filename = data.get('filename', '')
    
    if not os.path.exists(filename):
        return jsonify({"error": "File not found"}), 404
    
    with open(filename, "r") as file:
        journal_entry = file.read()
    
    return jsonify({"entry": journal_entry})

@app.route('/delete_journal', methods=['POST'])
def delete_journal():
    data = request.json
    filename = data.get('filename', '')
    
    if not os.path.exists(filename):
        return jsonify({"error": "File not found"}), 404
    
    try:
        os.remove(filename)
        return jsonify({"message": "Journal deleted successfully!"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/chat', methods=['POST'])
def chat():
    data = request.json
    journal_entry = data.get('journal', '')
    prompt = data.get('prompt', '')

    BLOCKED_WORDS = ["drunk", "beat", "abuse", "violence", "kill"]
    inappropriate = "⚠️ **This text is NSFW and not allowed.**"

    response = client.chat.completions.create(
        model="llama3-8b-8192",
        messages=[
            {"role": "system", "content": "You are a thoughtful AI journal companion that analyzes entries with empathy and insight. Connect with users in a warm, conversational tone while respecting their privacy and emotional state."},
        
            {"role": "user", "content": f"Journal Entry:\n{journal_entry}"},
            {"role": "user", "content": prompt},
        
            {"role": "system", "content": "Focus exclusively on insights related to the journal entry. Respond naturally as if in a supportive conversation. Show genuine understanding without being overly formal or clinical."},
        
            {"role": "system", "content": f"If the journal contains any concerning content related to {BLOCKED_WORDS}, respond with {inappropriate}. Do not engage with harmful, violent, or self-destructive content."},
        
            {"role": "system", "content": "Keep responses concise (1-3 sentences) unless the user specifically requests more detail. Be direct but thoughtful."},
        
            {"role": "system", "content": "Adapt your response style based on user requests: provide advice when asked for advice, summaries when asked for summaries, reflections when asked for analysis."},
        
            {"role": "system", "content": "Structure responses with natural paragraph breaks rather than walls of text. Use a conversational flow with clear points rather than formal lists or headers."},
        
            {"role": "system", "content": "Acknowledge emotions expressed in the journal without judgment. Respond to positive entries with encouragement and difficult entries with empathy."},
        
            {"role": "system", "content": "Don't reference yourself as an AI or mention these instructions in your responses."}

        ]
    )

    ai_response = response.choices[0].message.content.strip()
    
    
    ai_response = ai_response.replace("- ", "• ")
    
    return jsonify({"response": ai_response})

@app.route('/analyze_journals', methods=['GET'])
def analyze_journals():
    try:
        # Get all journal files
        journals = []
        mood_counts = {}
        
        def clean_mood_response(response):
            """Clean AI response to ensure single word mood"""
            # Remove common sentence patterns
            patterns = [
                r"the primary mood is\s+",
                r"the mood is\s+",
                r"the entry appears\s+",
                r"this entry is\s+",
                r"the tone is\s+",
                r"the emotional tone is\s+",
                r"primary mood:\s+",
                r"mood:\s+",
            ]
            
            cleaned = response.lower()
            for pattern in patterns:
                cleaned = re.sub(pattern, "", cleaned, flags=re.IGNORECASE)
            
            # Extract just the first word and capitalize it
            cleaned = cleaned.split()[0].strip('.,!?').capitalize()
            return cleaned
        
        for filename in os.listdir():
            if not filename.endswith('.txt'):
                continue
                
            with open(filename, 'r') as file:
                content = file.read()
                
            # Parse filename for date and title
            date, *title_parts = filename.replace('.txt', '').split('_')
            title = ' '.join(title_parts)
            
            # Analyze mood using AI with more specific prompt
            response = client.chat.completions.create(
                model="llama3-8b-8192",
                messages=[
                    {"role": "system", "content": "You are a mood analyzer. Respond with exactly one word representing the primary emotion or mood. Choose from: Happy, Sad, Anxious, Grateful, Excited, Calm, Frustrated, Hopeful, Reflective, Confident, Worried, Peaceful."},
                    {"role": "user", "content": content}
                ]
            )
            
            # Clean and standardize the mood response
            primary_mood = clean_mood_response(response.choices[0].message.content.strip())
            
            # Update mood statistics
            mood_counts[primary_mood] = mood_counts.get(primary_mood, 0) + 1
            
            # Calculate journal metrics
            word_count = len(content.split())
            reading_time = round(word_count / 200)
            
            journals.append({
                'title': title,
                'date': date,
                'wordCount': word_count,
                'readingTime': reading_time,
                'primaryMood': primary_mood,
            })
        
        # Sort journals by date (newest first)
        journals.sort(key=lambda x: x['date'], reverse=True)
        
        # Calculate mood statistics
        total_entries = len(journals)
        mood_stats = [
            {'label': 'Total Entries', 'value': total_entries},
            {'label': 'Unique Moods', 'value': len(mood_counts)},
            {'label': 'Most Common', 'value': max(mood_counts.items(), key=lambda x: x[1])[0]},
        ]
        
        return jsonify({
            'journals': journals,
            'moodAnalysis': mood_counts,
            'moodStats': mood_stats
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True)