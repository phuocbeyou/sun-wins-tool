import inquirer from 'inquirer';

// Custom renderer để ẩn dòng chọn sau khi hoàn thành prompt
const suppressFinalAnswerRenderer = {
  render() {},
  close() {},
};

export async function bacaratMenu() {
  const answers = await inquirer.prompt([
    {
      type: 'list',
      name: 'mainCmd',
      message: '📋 Chọn trò chơi:',
      choices: [
        { name: '🎲  Bắt đầu bacarat', value: 'bacarat_start' },
        { name: '🛑  Dừng tứ bacarat', value: 'bacarat_stop' },
        { name: '⚙️  Cấu hình rule', value: 'bacarat_setting' },
        new inquirer.Separator(),
        { name: '❌  Thoát', value: 'exit' },
      ],
      pageSize: 30,
    },
  ], { renderer: suppressFinalAnswerRenderer });  

  return answers.mainCmd;
}
