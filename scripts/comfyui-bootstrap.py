"""Use the existing ComfyUI environment without letting old wheels shadow stdlib."""
import runpy
import site
import sys

site.addsitedir('/opt/ComfyUI/.container-venv/lib/python3.10/site-packages')
sys.path.insert(0, '/opt/ComfyUI')
sys.argv[0] = '/opt/ComfyUI/main.py'
runpy.run_path(sys.argv[0], run_name='__main__')
