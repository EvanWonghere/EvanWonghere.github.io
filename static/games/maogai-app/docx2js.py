import docx
import json
import os
import re

def clean_text(text):
    """清理文本"""
    if text:
        return text.strip().replace('\n', ' ').replace('\r', '')
    return ""

def determine_type(answer, option_a):
    """判断题型"""
    ans = clean_text(answer).upper()
    # 答案是 T/F/对/错 或者 只有一个答案且没有选项A的内容，通常是判断题
    if ans in ['TRUE', 'FALSE', 'T', 'F', '对', '错'] or (not option_a and len(ans) == 1):
        return "判断"
    if len(ans) > 1:
        return "多选"
    return "单选"

def docx_to_js(docx_path, js_path):
    if not os.path.exists(docx_path):
        print(f"错误：找不到文件 {docx_path}")
        return

    doc = docx.Document(docx_path)
    questions = []
    
    print("正在解析文档...")

    for table in doc.tables:
        for row in table.rows:
            cells = [cell.text for cell in row.cells]
            
            # 过滤无效行
            if not cells or len(cells) < 3:
                continue

            q_id = clean_text(cells[0])
            question_text = clean_text(cells[1])
            answer = clean_text(cells[2])

            # 跳过表头
            if "序号" in q_id or "题目" in question_text:
                continue
            
            # 获取选项
            opt_a = clean_text(cells[3]) if len(cells) > 3 else ""
            opt_b = clean_text(cells[4]) if len(cells) > 4 else ""
            opt_c = clean_text(cells[5]) if len(cells) > 5 else ""
            opt_d = clean_text(cells[6]) if len(cells) > 6 else ""

            q_type = determine_type(answer, opt_a)

            # 规范化判断题答案
            if q_type == "判断":
                if answer.upper() in ['TRUE', 'T', '对', 'CHECKED']: # 兼容一些奇怪的格式
                    answer = "正确"
                else:
                    answer = "错误"
                # 清空选项以防万一
                opt_a = opt_b = opt_c = opt_d = ""
            
            # 存入字典
            if question_text and answer:
                questions.append({
                    "type": q_type,
                    "title": question_text,
                    "answer": answer.replace(" ", ""), # 去除答案内部空格
                    "options": {
                        "A": opt_a,
                        "B": opt_b,
                        "C": opt_c,
                        "D": opt_d
                    }
                })

    # 关键步骤：生成 JS 文件内容
    # 我们创建一个全局变量 window.QUESTION_BANK
    js_content = f"window.QUESTION_BANK = {json.dumps(questions, ensure_ascii=False, indent=2)};"

    with open(js_path, 'w', encoding='utf-8') as f:
        f.write(js_content)

    print(f"转换成功！共 {len(questions)} 题。")
    print(f"已生成数据文件: {js_path}")
    print("请确保此文件与 HTML 文件在同一目录下。")

# 运行转换
docx_to_js('毛概题库.docx', 'question_data.js')
