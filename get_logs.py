from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.desired_capabilities import DesiredCapabilities

chrome_options = Options()
chrome_options.add_argument('--headless')
chrome_options.set_capability('goog:loggingPrefs', {'browser': 'ALL'})

driver = webdriver.Chrome(options=chrome_options)
driver.get("http://127.0.0.1:8765/")

for entry in driver.get_log('browser'):
    print(entry)

driver.quit()
