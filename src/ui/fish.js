import inquirer from 'inquirer';

// Custom renderer để ẩn dòng chọn sau khi hoàn thành prompt
const suppressFinalAnswerRenderer = {
  render() {},
  close() {},
};

export async function fishMenu() {
  const answers = await inquirer.prompt([
    {
      type: 'list',
      name: 'mainCmd',
      message: '📋 Chọn trò chơi:',
      choices: [
        { name: '🎲  Bắt đầu bầu cua', value: 'fish_start' },
        { name: '🛑  Dừng bầu của', value: 'fish_stop' },
        { name: '⚙️  Cấu hình rule', value: 'fish_setting' },
        new inquirer.Separator(),
        { name: '❌  Thoát', value: 'exit' },
      ],
      pageSize: 30,
    },
  ], { renderer: suppressFinalAnswerRenderer });  

  return answers.mainCmd;
}
