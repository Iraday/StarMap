from http.server import HTTPServer, BaseHTTPRequestHandler
import json

class ErrorLogger(BaseHTTPRequestHandler):
    def do_POST(self):
        content_length = int(self.headers['Content-Length'])
        post_data = self.rfile.read(content_length)
        print("JS ERROR LOGGED:", post_data.decode('utf-8'))
        self.send_response(200)
        self.end_headers()

if __name__ == '__main__':
    server = HTTPServer(('127.0.0.1', 8766), ErrorLogger)
    print("Listening for JS errors on port 8766...")
    server.serve_forever()
