import docx
import csv
import re
import os

def clean_text(text):
    """清理文本：去除首尾空格、换行符"""
    if text:
        return text.strip().replace('\n', ' ').replace('\r', '')
    return ""

def determine_type(answer, option_a):
    """根据答案和选项判断题目类型"""
    ans = clean_text(answer).upper()
    
    # 判断题特征：答案是 TRUE/FALSE 或者没有选项A内容
    if ans in ['TRUE', 'FALSE', 'T', 'F', '对', '错'] or (not option_a and len(ans) == 1):
        return "判断"
    
    # 多选特征：答案长度大于1 (如 ABC)
    if len(ans) > 1:
        return "多选"
    
    # 默认单选
    return "单选"

def docx_to_csv(docx_path, csv_path):
    if not os.path.exists(docx_path):
        print(f"错误：找不到文件 {docx_path}")
        return

    doc = docx.Document(docx_path)
    questions = []
    
    print("正在读取文档...")

    for table in doc.tables:
        for row in table.rows:
            cells = [cell.text for cell in row.cells]
            
            # 跳过空行或列数过少的行
            if not cells or len(cells) < 3:
                continue

            # 获取基本信息
            # 假设前三列固定为：序号, 题目, 答案
            q_id = clean_text(cells[0])
            question_text = clean_text(cells[1])
            answer = clean_text(cells[2])

            # 跳过表头（如果第一列是"序号"）
            if "序号" in q_id or "题目" in question_text:
                continue
            
            # 尝试获取选项
            opt_a = clean_text(cells[3]) if len(cells) > 3 else ""
            opt_b = clean_text(cells[4]) if len(cells) > 4 else ""
            opt_c = clean_text(cells[5]) if len(cells) > 5 else ""
            opt_d = clean_text(cells[6]) if len(cells) > 6 else ""

            # 判断题目类型
            q_type = determine_type(answer, opt_a)

            # 格式化数据
            if q_type == "判断":
                # 统一判断题答案格式
                if answer.upper() in ['TRUE', 'T', '对']:
                    answer = "正确"
                else:
                    answer = "错误"
                # 判断题不需要选项内容
                opt_a = opt_b = opt_c = opt_d = ""
            
            if q_id and question_text and answer:
                questions.append([q_type, question_text, answer, opt_a, opt_b, opt_c, opt_d])

    # 写入 CSV
    with open(csv_path, 'w', newline='', encoding='utf-8-sig') as f:
        writer = csv.writer(f)
        # 写入表头
        writer.writerow(['type', 'question', 'answer', 'optionA', 'optionB', 'optionC', 'optionD'])
        writer.writerows(questions)

    print(f"转换完成！共提取 {len(questions)} 道题目。")
    print(f"文件已保存为: {csv_path}")

# 执行转换
# 请确保文件名与你的真实文件名一致
docx_to_csv('毛概题库.docx', 'question_bank.csv')
